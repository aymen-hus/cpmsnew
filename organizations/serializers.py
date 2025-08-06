from rest_framework import serializers
from django.contrib.auth.models import User
from django.db import models
from decimal import Decimal
from .models import (
    Organization, OrganizationUser, StrategicObjective,
    Program, StrategicInitiative, PerformanceMeasure, 
    MainActivity, ActivityBudget, ActivityCostingAssumption,
    Plan, PlanReview, InitiativeFeed,SupervisorCost,PrintingCost,
    SessionCost,ParticipantCost,Accommodation,PerDiem,AirTransport,
    LandTransport,Location,ProcurementItem
)
from django.db.models import Q
import logging

# Set up logger
logger = logging.getLogger(__name__)

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name']
        read_only_fields = ['id']

class OrganizationUserSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    user_id = serializers.IntegerField(write_only=True)
    organization_name = serializers.CharField(source='organization.name', read_only=True)

    class Meta:
        model = OrganizationUser
        fields = ['id', 'user', 'user_id', 'organization', 'organization_name', 'role', 'created_at']
        read_only_fields = ['id', 'created_at']

class InitiativeFeedSerializer(serializers.ModelSerializer):
    strategic_objective_title = serializers.CharField(
        source='strategic_objective.title',
        read_only=True,
        allow_null=True
    )
    
    class Meta:
        model = InitiativeFeed
        fields = ['id', 'name', 'description', 'strategic_objective', 'strategic_objective_title', 'is_active', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


class OrganizationSerializer(serializers.ModelSerializer):
    parent_name = serializers.CharField(source='parent.name', read_only=True, allow_null=True)
    children = serializers.SerializerMethodField()
    users = serializers.SerializerMethodField()
    core_values = serializers.JSONField(required=False, allow_null=True)

    class Meta:
        model = Organization
        fields = [
            'id', 'name', 'type', 'parent', 'parent_name', 'children',
            'vision', 'mission', 'core_values', 'users',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
        
    def get_children(self, obj):
        try:
            return OrganizationSerializer(obj.children.all(), many=True).data
        except Exception as e:
            logger.exception(f"Error getting children for organization {obj.id}: {str(e)}")
            return []
            
    def get_users(self, obj):
        # Get User objects through OrganizationUser relationship
        try:
            org_users = obj.users.all()
            user_data = []
            for org_user in org_users:
                try:
                    user = org_user.user  # Access the related User object
                    user_data.append({
                        'id': user.id,
                        'username': user.username,
                        'email': user.email,
                        'first_name': user.first_name,
                        'last_name': user.last_name
                    })
                except Exception as e:
                    logger.exception(f"Error serializing user for organization {obj.id}: {str(e)}")
            return user_data
        except Exception as e:
            logger.exception(f"Error getting users for organization {obj.id}: {str(e)}")
            return []
            
    def get_users(self, obj):
        # Get User objects through OrganizationUser relationship
        org_users = obj.users.all()
        user_data = []
        for org_user in org_users:
            try:
                user = org_user.user  # Access the related User object
                user_data.append({
                    'id': user.id,
                    'username': user.username,
                    'email': user.email,
                    'first_name': user.first_name,
                    'last_name': user.last_name
                })
            except Exception as e:
                logger.exception(f"Error serializing user for organization {obj.id}: {str(e)}")
        return user_data
            
    def to_representation(self, instance):
        try:
            # Get the normal representation
            representation = super().to_representation(instance)
            
            # Check if core_values is null and replace with empty array for consistency
            if representation.get('core_values') is None:
                representation['core_values'] = []
                
            return representation
        except Exception as e:
            logger.exception(f"Error in OrganizationSerializer.to_representation: {str(e)}")
            # Return a minimal representation to avoid complete failure
            return {
                'id': instance.id,
                'name': instance.name,
                'type': instance.type,
                'core_values': []
            }
            
    def update(self, instance, validated_data):
        try:
            logger.info(f"Updating organization {instance.id} with data: {validated_data}")
            
            # Handle core_values specially to ensure consistency
            if 'core_values' in validated_data:
                # If we get None, convert to empty list
                if validated_data['core_values'] is None:
                    validated_data['core_values'] = []
                # If we get a string, try to parse as JSON
                elif isinstance(validated_data['core_values'], str):
                    try:
                        import json
                        validated_data['core_values'] = json.loads(validated_data['core_values'])
                    except:
                        validated_data['core_values'] = []
            
            return super().update(instance, validated_data)
        except Exception as e:
            logger.exception(f"Error updating organization {instance.id}: {str(e)}")
            raise serializers.ValidationError(f"Update failed: {str(e)}")


class ActivityBudgetSerializer(serializers.ModelSerializer):
    activity_name = serializers.CharField(source='activity.name', read_only=True)
    total_funding = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        read_only=True
    )
    funding_gap = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        read_only=True
    )
    estimated_cost = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        read_only=True
    )

    class Meta:
        model = ActivityBudget
        fields = [
            'id', 'activity', 'activity_name', 'budget_calculation_type', 'activity_type',
            'estimated_cost_with_tool', 'estimated_cost_without_tool',
            'government_treasury', 'sdg_funding', 'partners_funding', 'other_funding',
            'total_funding', 'estimated_cost', 'funding_gap',
            'training_details', 'meeting_workshop_details',
            'procurement_details', 'printing_details', 'supervision_details',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate(self, data):
        # Get the budget calculation type
        budget_calculation_type = data.get('budget_calculation_type', 'WITHOUT_TOOL')
        
        # Get the estimated cost based on calculation type
        estimated_cost = (
            data.get('estimated_cost_with_tool', 0)
            if budget_calculation_type == 'WITH_TOOL'
            else data.get('estimated_cost_without_tool', 0)
        )

        # Calculate total funding
        total_funding = (
            Decimal(str(data.get('government_treasury', 0))) +
            Decimal(str(data.get('sdg_funding', 0))) +
            Decimal(str(data.get('partners_funding', 0))) +
            Decimal(str(data.get('other_funding', 0)))
        )

        # Validate total funding against estimated cost
        if total_funding > Decimal(str(estimated_cost)):
            raise serializers.ValidationError(
                f'Total funding ({total_funding}) cannot exceed estimated cost ({estimated_cost})'
            )

        return data

    def to_representation(self, instance):
        data = super().to_representation(instance)
        
        # Ensure numeric fields are properly formatted
        numeric_fields = [
            'estimated_cost_with_tool', 'estimated_cost_without_tool',
            'government_treasury', 'sdg_funding', 'partners_funding', 'other_funding',
            'total_funding', 'estimated_cost', 'funding_gap'
        ]
        
        for field in numeric_fields:
            if field in data:
                data[field] = float(data[field] or 0)
        
        return data
        

class MainActivitySerializer(serializers.ModelSerializer):
    # Add nested budget representation if needed
    budget = serializers.SerializerMethodField()
    quarterly_sum = serializers.SerializerMethodField()
    organization_id = serializers.IntegerField(write_only=True, required=False)
    organization_name = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = MainActivity
        fields = [
            'id', 'initiative', 'name', 'weight', 'selected_months', 
            'selected_quarters', 'budget', 'baseline', 'target_type',
            'q1_target', 'q2_target', 'q3_target', 'q4_target', 
            'annual_target', 'quarterly_sum', 'created_at', 'updated_at',
            'organization', 'organization_id', 'organization_name'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'budget', 'quarterly_sum', 'organization_name']

    def get_organization_name(self, obj):
        return obj.organization.name if obj.organization else None

    def get_budget(self, obj):
        # Get the budget or return None if it doesn't exist
        try:
            if hasattr(obj, 'budget'):
                return ActivityBudgetSerializer(obj.budget).data
            return None
        except ActivityBudget.DoesNotExist:
            return None

    def get_quarterly_sum(self, obj):
        return float(obj.q1_target + obj.q2_target + obj.q3_target + obj.q4_target)

    def validate(self, data):
        # Validate based on target_type
        target_type = data.get('target_type', 'cumulative')
        q1_target = data.get('q1_target', 0)
        q2_target = data.get('q2_target', 0)
        q3_target = data.get('q3_target', 0)
        q4_target = data.get('q4_target', 0)
        annual_target = data.get('annual_target', 0)
        
        if target_type == 'cumulative':
            # Sum of quarterly targets should equal annual target
            quarterly_sum = q1_target + q2_target + q3_target + q4_target
            if quarterly_sum != annual_target:
                raise serializers.ValidationError({
                    'annual_target': f'For cumulative targets, sum of quarterly targets ({quarterly_sum}) must equal annual target ({annual_target})'
                })
        elif target_type == 'increasing':
            # Targets should be in ascending order
            if not (q1_target <= q2_target <= q3_target <= q4_target):
                raise serializers.ValidationError({
                    'q1_target': 'For increasing targets, quarterly targets must be in ascending order (Q1 ≤ Q2 ≤ Q3 ≤ Q4)'
                })
            # Q4 must equal annual target
            if q4_target != annual_target:
                raise serializers.ValidationError({
                    'q4_target': f'For increasing targets, Q4 target ({q4_target}) must equal annual target ({annual_target})'
                })
        elif target_type == 'decreasing':
            # Targets should be in descending order
            if not (q1_target >= q2_target >= q3_target >= q4_target):
                raise serializers.ValidationError({
                    'q1_target': 'For decreasing targets, quarterly targets must be in descending order (Q1 ≥ Q2 ≥ Q3 ≥ Q4)'
                })
            # Q4 must equal annual target
            if q4_target != annual_target:
                raise serializers.ValidationError({
                    'q4_target': f'For decreasing targets, Q4 target ({q4_target}) must equal annual target ({annual_target})'
                })
        elif target_type == 'annual':
            # All quarterly targets must equal annual target
            if not (q1_target == annual_target and q2_target == annual_target and q3_target == annual_target and q4_target == annual_target):
                raise serializers.ValidationError({
                    'annual_target': f'For annual targets, all quarterly targets must equal annual target ({annual_target})'
                })
        
       
         # Validate against the expected max weight (65% of initiative weight)
        if 'initiative' in data and 'weight' in data:
            try:
                initiative_id = data['initiative']
                weight_value = data['weight']
                
                if isinstance(initiative_id, StrategicInitiative):
                    initiative = initiative_id
                else:
                    initiative = StrategicInitiative.objects.get(id=initiative_id)
                
                # Calculate 65% of initiative weight as a value
                expected_activities_weight = float(initiative.weight) * 0.65
                
                # Get total weight of existing activities (excluding current one)
                instance_id = self.instance.id if self.instance else None
                
                activities_query = MainActivity.objects.filter(initiative=initiative)
                if instance_id:
                    activities_query = activities_query.exclude(id=instance_id)
                
                total_existing_weight = activities_query.aggregate(
                    total=models.Sum('weight')
                )['total'] or 0
                
                # Check if adding this weight would exceed the limit
                if float(total_existing_weight) + float(weight_value) > expected_activities_weight:
                    raise serializers.ValidationError({
                     'weight': f'Total weight of main activities cannot exceed 65% of initiative weight ({max_allowed_weight}). Current total: {float(total_existing_weight)}, This activity: {float(weight_value)}, Max allowed: {max_allowed_weight}'

                    })
            except StrategicInitiative.DoesNotExist:
                pass  # Initiative validation will be handled elsewhere
            except Exception as e:
                logger.exception(f"Error validating main activity weight: {str(e)}")
            return data

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # Ensure numeric fields are properly formatted
        numeric_fields = ['q1_target', 'q2_target', 'q3_target', 'q4_target', 'annual_target', 'weight']
        for field in numeric_fields:
            if field in data:
                data[field] = float(data[field] or 0)
        return data


class ActivityCostingAssumptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ActivityCostingAssumption
        fields = [
            'id', 'activity_type', 'location', 'cost_type', 'amount',
            'description', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate_amount(self, value):
        if value < 0:
            raise serializers.ValidationError('Amount cannot be negative')
        return value

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if 'amount' in data:
            data['amount'] = float(data['amount'] or 0)
        return data



class LocationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Location
        fields = ['id', 'name', 'region', 'is_hardship_area', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']

class LandTransportSerializer(serializers.ModelSerializer):
    origin_name = serializers.CharField(source='origin.name', read_only=True)
    destination_name = serializers.CharField(source='destination.name', read_only=True)
    
    class Meta:
        model = LandTransport
        fields = ['id', 'origin', 'origin_name', 'destination', 'destination_name', 
                  'trip_type', 'price', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at', 'origin_name', 'destination_name']

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if 'price' in data:
            data['price'] = float(data['price'] or 0)
        return data

class AirTransportSerializer(serializers.ModelSerializer):
    origin_name = serializers.CharField(source='origin.name', read_only=True)
    destination_name = serializers.CharField(source='destination.name', read_only=True)
    
    class Meta:
        model = AirTransport
        fields = ['id', 'origin', 'origin_name', 'destination', 'destination_name', 
                  'price', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at', 'origin_name', 'destination_name']

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if 'price' in data:
            data['price'] = float(data['price'] or 0)
        return data


class PerDiemSerializer(serializers.ModelSerializer):
    location_name = serializers.CharField(source='location.name', read_only=True)
    
    class Meta:
        model = PerDiem
        fields = ['id', 'location', 'location_name', 'amount', 'hardship_allowance_amount', 
                  'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at', 'location_name']

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if 'amount' in data:
            data['amount'] = float(data['amount'] or 0)
        if 'hardship_allowance_amount' in data:
            data['hardship_allowance_amount'] = float(data['hardship_allowance_amount'] or 0)
        return data

class AccommodationSerializer(serializers.ModelSerializer):
    location_name = serializers.CharField(source='location.name', read_only=True)
    service_type_display = serializers.CharField(source='get_service_type_display', read_only=True)
    
    class Meta:
        model = Accommodation
        fields = ['id', 'location', 'location_name', 'service_type', 'service_type_display', 
                  'price', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at', 'location_name', 'service_type_display']

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if 'price' in data:
            data['price'] = float(data['price'] or 0)
        return data

class ParticipantCostSerializer(serializers.ModelSerializer):
    cost_type_display = serializers.CharField(source='get_cost_type_display', read_only=True)
    
    class Meta:
        model = ParticipantCost
        fields = ['id', 'cost_type', 'cost_type_display', 'price', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at', 'cost_type_display']

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if 'price' in data:
            data['price'] = float(data['price'] or 0)
        return data

class SessionCostSerializer(serializers.ModelSerializer):
    cost_type_display = serializers.CharField(source='get_cost_type_display', read_only=True)
    
    class Meta:
        model = SessionCost
        fields = ['id', 'cost_type', 'cost_type_display', 'price', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at', 'cost_type_display']

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if 'price' in data:
            data['price'] = float(data['price'] or 0)
        return data

class PrintingCostSerializer(serializers.ModelSerializer):
    document_type_display = serializers.CharField(source='get_document_type_display', read_only=True)
    
    class Meta:
        model = PrintingCost
        fields = ['id', 'document_type', 'document_type_display', 'price_per_page', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at', 'document_type_display']

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if 'price_per_page' in data:
            data['price_per_page'] = float(data['price_per_page'] or 0)
        return data

class SupervisorCostSerializer(serializers.ModelSerializer):
    cost_type_display = serializers.CharField(source='get_cost_type_display', read_only=True)
    
    class Meta:
        model = SupervisorCost
        fields = ['id', 'cost_type', 'cost_type_display', 'amount', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at', 'cost_type_display']

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if 'amount' in data:
            data['amount'] = float(data['amount'] or 0)
        return data

class ProcurementItemSerializer(serializers.ModelSerializer):
    category_display = serializers.CharField(source='get_category_display', read_only=True)
    unit_display = serializers.CharField(source='get_unit_display', read_only=True)
    
    class Meta:
        model = ProcurementItem
        fields = ['id', 'category', 'category_display', 'name', 'unit', 'unit_display', 'unit_price', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at', 'category_display', 'unit_display']

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if 'unit_price' in data:
            data['unit_price'] = float(data['unit_price'] or 0)
        return data


class PerformanceMeasureSerializer(serializers.ModelSerializer):
    initiative_name = serializers.CharField(source='initiative.name', read_only=True)
    quarterly_sum = serializers.SerializerMethodField()
    organization_id = serializers.IntegerField(write_only=True, required=False)
    organization_name = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = PerformanceMeasure
        fields = [
            'id', 'initiative', 'initiative_name', 'name', 'weight',
            'baseline', 'target_type', 'q1_target', 'q2_target', 'q3_target', 'q4_target',
            'annual_target', 'quarterly_sum', 'created_at', 'updated_at',
            'organization', 'organization_id', 'organization_name',
            'selected_months', 'selected_quarters'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'quarterly_sum', 'organization_name']

    def get_organization_name(self, obj):
        return obj.organization.name if obj.organization else None

    def get_quarterly_sum(self, obj):
        return float(obj.q1_target + obj.q2_target + obj.q3_target + obj.q4_target)

    def validate(self, data):
        # Validate based on target_type
        target_type = data.get('target_type', 'cumulative')
        q1_target = data.get('q1_target', 0)
        q2_target = data.get('q2_target', 0)
        q3_target = data.get('q3_target', 0)
        q4_target = data.get('q4_target', 0)
        annual_target = data.get('annual_target', 0)
        
        if target_type == 'cumulative':
            # Sum of quarterly targets should equal annual target
            quarterly_sum = q1_target + q2_target + q3_target + q4_target
            if quarterly_sum != annual_target:
                raise serializers.ValidationError({
                    'annual_target': f'For cumulative targets, sum of quarterly targets ({quarterly_sum}) must equal annual target ({annual_target})'
                })
        elif target_type == 'increasing':
            # Targets should be in ascending order
            if not (q1_target <= q2_target <= q3_target <= q4_target):
                raise serializers.ValidationError({
                    'q1_target': 'For increasing targets, quarterly targets must be in ascending order (Q1 ≤ Q2 ≤ Q3 ≤ Q4)'
                })
            # Q4 must equal annual target
            if q4_target != annual_target:
                raise serializers.ValidationError({
                    'q4_target': f'For increasing targets, Q4 target ({q4_target}) must equal annual target ({annual_target})'
                })
        elif target_type == 'decreasing':
            # Targets should be in descending order
            if not (q1_target >= q2_target >= q3_target >= q4_target):
                raise serializers.ValidationError({
                    'q1_target': 'For decreasing targets, quarterly targets must be in descending order (Q1 ≥ Q2 ≥ Q3 ≥ Q4)'
                })
            # Q4 must equal annual target
            if q4_target != annual_target:
                raise serializers.ValidationError({
                    'q4_target': f'For decreasing targets, Q4 target ({q4_target}) must equal annual target ({annual_target})'
                })
        
        # Validate against the expected max weight (35% of initiative weight)
        if 'initiative' in data and 'weight' in data:
            try:
                initiative_id = data['initiative']
                weight_value = data['weight']
                
                if isinstance(initiative_id, StrategicInitiative):
                    initiative = initiative_id
                else:
                    initiative = StrategicInitiative.objects.get(id=initiative_id)
                
                # Calculate 35% of initiative weight
                max_allowed_weight = round(float(initiative.weight) * 0.35, 2)
                
                # Get total weight of existing measures (excluding current one)
                instance_id = self.instance.id if self.instance else None
                
                measures_query = PerformanceMeasure.objects.filter(initiative=initiative)
                if instance_id:
                    measures_query = measures_query.exclude(id=instance_id)
                
                total_existing_weight = measures_query.aggregate(
                    total=models.Sum('weight')
                )['total'] or 0
                
                # Check if adding this weight would exceed the limit
                if float(total_existing_weight) + float(weight_value) > max_allowed_weight:
                    raise serializers.ValidationError({
                        'weight': f'Total weight of performance measures cannot exceed 35% of initiative weight ({max_allowed_weight}). Current total: {float(total_existing_weight)}, This measure: {float(weight_value)}'
                    })
            except StrategicInitiative.DoesNotExist:
                pass  # Initiative validation will be handled elsewhere
            except Exception as e:
                logger.exception(f"Error validating performance measure weight: {str(e)}")
            
        # Basic weight validation
        if data.get('weight', 0) < 0 or data.get('weight', 0) > 100:
            raise serializers.ValidationError('Weight must be between 0 and 100')
            
        return data

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # Ensure numeric fields are properly formatted
        numeric_fields = ['q1_target', 'q2_target', 'q3_target', 'q4_target', 'annual_target', 'weight']
        for field in numeric_fields:
            if field in data:
                data[field] = float(data[field] or 0)
        return data

class StrategicInitiativeSerializer(serializers.ModelSerializer):
    performance_measures = PerformanceMeasureSerializer(many=True, read_only=True)
    main_activities = MainActivitySerializer(many=True, read_only=True)
    strategic_objective_title = serializers.CharField(
        source='strategic_objective.title',
        read_only=True,
        allow_null=True
    )
    program_name = serializers.CharField(
        source='program.name',
        read_only=True,
        allow_null=True
    )
    total_measures_weight = serializers.DecimalField(
        max_digits=5,
        decimal_places=2,
        read_only=True,
        default=0
    )
    total_activities_weight = serializers.DecimalField(
        max_digits=5,
        decimal_places=2,
        read_only=True,
        default=0
    )
    is_default = serializers.BooleanField(default=True)
    organization_id = serializers.IntegerField(write_only=True, required=False)
    organization_name = serializers.SerializerMethodField(read_only=True)
    initiative_feed = serializers.PrimaryKeyRelatedField(
        queryset=InitiativeFeed.objects.filter(is_active=True),
        required=False,
        allow_null=True
    )
    initiative_feed_name = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = StrategicInitiative
        fields = [
            'id', 'name', 'weight', 'is_default',
            'strategic_objective', 'strategic_objective_title',
            'program', 'program_name',
            'performance_measures', 'main_activities',
            'total_measures_weight', 'total_activities_weight',
            'created_at', 'updated_at', 'organization',
            'organization_id', 'organization_name',
            'initiative_feed', 'initiative_feed_name'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'organization_name', 'initiative_feed_name']

    def get_organization_name(self, obj):
        return obj.organization.name if obj.organization else None
        
    def get_initiative_feed_name(self, obj):
        return obj.initiative_feed.name if obj.initiative_feed else None

    def validate(self, data):
        # Ensure initiative is linked to exactly one parent
        parents = sum(1 for x in [
            data.get('strategic_objective', None),
            data.get('program', None)
        ] if x is not None)
        
        if parents != 1:
            raise serializers.ValidationError(
                'Initiative must be linked to exactly one parent (objective or program)'
            )
        
        # If an initiative_feed is provided, ensure the name matches
        if 'initiative_feed' in data and data['initiative_feed'] and not data.get('name'):
            # Copy the name from the initiative feed
            data['name'] = data['initiative_feed'].name
            
        # Get the parent objective to check weights - handle type conversion
        if 'strategic_objective' in data and data['strategic_objective']:
            try:
                # Handle case where strategic_objective is a full object instead of ID
                objective_id = data['strategic_objective']
                if isinstance(objective_id, StrategicObjective):
                    objective_id = objective_id.id
                elif isinstance(objective_id, str) and not objective_id.isdigit():
                    # Try to extract numeric ID if it's a string representation of an object
                    import re
                    numeric_match = re.search(r'\d+', objective_id)
                    if numeric_match:
                        objective_id = int(numeric_match.group())
                        
                objective = StrategicObjective.objects.get(id=objective_id)
                
                # If this is a default objective with planner_weight, use that for validation
                if objective.is_default and objective.planner_weight is not None:
                    effective_weight = objective.planner_weight
                else:
                    effective_weight = objective.weight
                    
                # Validate that initiative weight doesn't exceed parent weight
                if 'weight' in data and data['weight'] > effective_weight:
                    raise serializers.ValidationError(
                        f"Initiative weight ({data['weight']}) cannot exceed parent objective weight ({effective_weight})"
                    )
            except StrategicObjective.DoesNotExist:
                pass
        
        return data

    def to_representation(self, instance):
        try:
            data = super().to_representation(instance)
            # Ensure numeric fields are properly formatted
            if 'weight' in data:
                data['weight'] = float(data['weight'] or 0)
            if 'total_measures_weight' in data:
                data['total_measures_weight'] = float(data['total_measures_weight'] or 0)
            if 'total_activities_weight' in data:
                data['total_activities_weight'] = float(data['total_activities_weight'] or 0)
            return data
        except Exception as e:
            logger.exception(f"Error in StrategicInitiativeSerializer.to_representation: {str(e)}")
            # Return minimal representation to avoid complete failure
            return {
                'id': str(instance.id),
                'name': str(instance.name),
                'weight': float(instance.weight or 0),
                'is_default': bool(instance.is_default)
            }

    def create(self, validated_data):
        try:
            # Handle organization_id if present
            organization_id = validated_data.pop('organization_id', None)            
            if organization_id is not None:
                # Make sure it's a number
                if hasattr(organization_id, 'id'):
                    # Handle case where this is a full Organization object
                    validated_data['organization_id'] = organization_id.id
                else:
                    validated_data['organization_id'] = int(organization_id)
                
            logger.info(f"Creating initiative with data: {validated_data}")
            return super().create(validated_data)
        except Exception as e:
            logger.exception(f"Error creating initiative: {str(e)}")
            raise serializers.ValidationError(f"Failed to create initiative: {str(e)}")

    def update(self, instance, validated_data):
        try:
            # Handle organization_id if present
            organization_id = validated_data.pop('organization_id', None)            
            if organization_id is not None:
                # Make sure it's a number
                if hasattr(organization_id, 'id'):
                    # Handle case where this is a full Organization object
                    validated_data['organization_id'] = organization_id.id
                else:
                    validated_data['organization_id'] = int(organization_id)
            
            logger.info(f"Updating initiative {instance.id} with data: {validated_data}")
            return super().update(instance, validated_data)
        except Exception as e:
            logger.exception(f"Error updating initiative: {str(e)}")
            raise serializers.ValidationError(f"Failed to update initiative: {str(e)}")


class ProgramSerializer(serializers.ModelSerializer):
    initiatives = StrategicInitiativeSerializer(many=True, read_only=True)
    strategic_objective_title = serializers.CharField(
        source='strategic_objective.title',
        read_only=True
    )
    is_default = serializers.BooleanField(default=True)

    class Meta:
        model = Program
        fields = [
            'id', 'strategic_objective', 'strategic_objective_title',
            'name', 'description', 'is_default',
            'initiatives', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def to_representation(self, instance):
        data = super().to_representation(instance)
        return data

class StrategicObjectiveSerializer(serializers.ModelSerializer):
    programs = ProgramSerializer(many=True, read_only=True)
    initiatives = StrategicInitiativeSerializer(many=True, read_only=True)
    total_weight = serializers.DecimalField(
        max_digits=5,
        decimal_places=2,
        read_only=True,
        help_text="Total weight of all initiatives"
    )
    is_default = serializers.BooleanField(default=True)
    planner_weight = serializers.DecimalField(
        max_digits=5,
        decimal_places=2,
        required=False,
        allow_null=True,
        help_text="Custom weight assigned by planner"
    )
    effective_weight = serializers.SerializerMethodField(
        help_text="The actual weight to be used (planner_weight if set, otherwise weight)"
    )

    class Meta:
        model = StrategicObjective
        fields = [
            'id', 'title', 'description', 'weight', 'planner_weight', 'effective_weight', 'is_default',
            'programs', 'initiatives', 'total_weight',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'total_weight', 'effective_weight']

    def get_effective_weight(self, obj):
        # Return planner_weight if set, otherwise return weight
        if obj.planner_weight is not None:
            return obj.planner_weight
        return obj.weight

    def validate_weight(self, value):
        if value < 0 or value > 100:
            raise serializers.ValidationError('Weight must be between 0 and 100')
        return value

    def validate_planner_weight(self, value):
        if value is not None and (value < 0 or value > 100):
            raise serializers.ValidationError('Planner weight must be between 0 and 100')
        return value

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if 'weight' in data:
            data['weight'] = float(data['weight'] or 0)
        if 'planner_weight' in data:
            data['planner_weight'] = float(data['planner_weight']) if data['planner_weight'] is not None else None
        if 'effective_weight' in data:
            data['effective_weight'] = float(data['effective_weight'] or 0)
        if 'total_weight' in data:
            data['total_weight'] = float(data['total_weight'] or 0)
        return data

class ActivityCostingAssumptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ActivityCostingAssumption
        fields = [
            'id', 'activity_type', 'location', 'cost_type',
            'amount', 'description', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate_amount(self, value):
        if value < 0:
            raise serializers.ValidationError('Amount cannot be negative')
        return value

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if 'amount' in data:
            data['amount'] = float(data['amount'] or 0)
        return data

class PlanReviewSerializer(serializers.ModelSerializer):
    evaluator_name = serializers.CharField(source='evaluator.user.get_full_name', read_only=True)
    plan_name = serializers.CharField(source='plan.__str__', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = PlanReview
        fields = [
            'id', 'plan', 'plan_name', 'evaluator', 'evaluator_name',
            'status', 'status_display', 'feedback', 'reviewed_at'
        ]
        read_only_fields = ['id']

    def validate(self, data):
        # Ensure evaluator has EVALUATOR role
        evaluator = data.get('evaluator')
        if evaluator and evaluator.role != 'EVALUATOR':
            raise serializers.ValidationError('Only users with EVALUATOR role can review plans')

        # Ensure plan is in SUBMITTED status
        plan = data.get('plan')
        if plan and plan.status != 'SUBMITTED':
            raise serializers.ValidationError('Can only review plans that are in SUBMITTED status')

        # Ensure reviewed_at is set
        if 'reviewed_at' not in data or not data['reviewed_at']:
            from django.utils import timezone
            data['reviewed_at'] = timezone.now()

        return data

class PlanSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    organization_name = serializers.CharField(source='organization.name', read_only=True)
    
    organization_name = serializers.CharField(source='organization.name', read_only=True)
    strategic_objective_title = serializers.CharField(source='strategic_objective.title', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    type_display = serializers.CharField(source='get_type_display', read_only=True)
    reviews = PlanReviewSerializer(many=True, read_only=True)
    objectives = serializers.SerializerMethodField()

    class Meta:
        model = Plan
        fields = [
            'id', 'organization', 'organization_name', 'planner_name',
            'type', 'type_display', 'executive_name', 'strategic_objective', 'strategic_objective_title',
            'status', 'submitted_at', 'created_at', 'updated_at', 'selected_objectives',
            'selected_objectives_weights', 'status_display', 'organization_name'
            'submitted_at', 'created_at', 'updated_at', 'reviews', 'objectives'
        ]
        read_only_fields = ['id', 'submitted_at', 'created_at', 'updated_at']

    def get_objectives(self, obj):
        """Return the strategic objective with its initiatives, measures, and activities"""
        if not obj.strategic_objective:
            return None
            
        # Get from selected_objectives (many-to-many field) - these are the planner's actual selections
        selected_objectives = obj.selected_objectives.all()
        
        if selected_objectives.exists():
            # Use ONLY the selected objectives from the many-to-many field (planner's selections)
            objectives_to_process = selected_objectives
            logger.info(f"Using {selected_objectives.count()} selected objectives from plan")
        else:
            # Fallback to the single strategic_objective for backward compatibility (old plans)
            objectives_to_process = [obj.strategic_objective] if obj.strategic_objective else []
            logger.info("Using fallback single strategic_objective")
        
        objectives_data = []
        
        # Get the plan's organization ID for filtering
        plan_organization_id = obj.organization_id
        logger.info(f"Filtering initiatives for plan organization: {plan_organization_id}")
        
        for objective in objectives_to_process:
            if not objective:
                continue
                
            try:
                # Process each objective
                objective_data = {
                    'id': objective.id,
                    'title': objective.title,
                    'description': objective.description,
                    'weight': objective.weight,
                    'planner_weight': objective.planner_weight,
                     'effective_weight': objective.planner_weight if objective.planner_weight is not None else objective.weight,
                    'is_default': objective.is_default,
                    'initiatives': []
                }
                
                logger.info(f"Processing objective {objective.id}: {objective.title} (planner_weight: {objective.planner_weight})")
                
                # Get initiatives for this objective, filtered by organization
                initiatives = objective.initiatives.filter(
                    models.Q(organization_id=plan_organization_id) |  # Initiatives from plan's organization
                    models.Q(organization_id__isnull=True) |          # Initiatives with no organization (default)
                    models.Q(is_default=True)                        # Default initiatives
                )
                
                logger.info(f"Found {initiatives.count()} initiatives for objective {objective.id} (filtered by org {plan_organization_id})")
                
                for initiative in initiatives:
                    if not initiative:
                        continue
                        
                    initiative_data = {
                        'id': initiative.id,
                        'name': initiative.name,
                        'weight': initiative.weight,
                        'organization_name': initiative.organization.name if initiative.organization else None,
                        'performance_measures': [],
                        'main_activities': []
                    }
                    
                    # Get performance measures, filtered by organization
                    measures = initiative.performance_measures.filter(
                        models.Q(organization_id=plan_organization_id) |  # Measures from plan's organization
                        models.Q(organization_id__isnull=True)            # Measures with no organization (default)
                    )
                    
                    logger.info(f"Found {measures.count()} performance measures for initiative {initiative.id}")
                    
                    for measure in measures:
                        if not measure:
                            continue
                            
                        measure_data = {
                            'id': measure.id,
                            'name': measure.name,
                            'weight': measure.weight,
                            'baseline': measure.baseline,
                            'target_type': getattr(measure, 'target_type', 'cumulative'),
                            'q1_target': measure.q1_target,
                            'q2_target': measure.q2_target,
                            'q3_target': measure.q3_target,
                            'q4_target': measure.q4_target,
                            'annual_target': measure.annual_target,
                            'selected_months': getattr(measure, 'selected_months', []),
                            'selected_quarters': getattr(measure, 'selected_quarters', [])
                        }
                        initiative_data['performance_measures'].append(measure_data)
                    
                    # Get main activities, filtered by organization
                    activities = initiative.main_activities.filter(
                        models.Q(organization_id=plan_organization_id) |  # Activities from plan's organization
                        models.Q(organization_id__isnull=True)            # Activities with no organization (default)
                    )
                    
                    logger.info(f"Found {activities.count()} main activities for initiative {initiative.id}")
                    
                    for activity in activities:
                        if not activity:
                            continue
                            
                        activity_data = {
                            'id': activity.id,
                            'name': activity.name,
                            'weight': activity.weight,
                            'baseline': getattr(activity, 'baseline', ''),
                            'target_type': getattr(activity, 'target_type', 'cumulative'),
                            'q1_target': getattr(activity, 'q1_target', 0),
                            'q2_target': getattr(activity, 'q2_target', 0),
                            'q3_target': getattr(activity, 'q3_target', 0),
                            'q4_target': getattr(activity, 'q4_target', 0),
                            'annual_target': getattr(activity, 'annual_target', 0),
                            'selected_months': getattr(activity, 'selected_months', []),
                            'selected_quarters': getattr(activity, 'selected_quarters', []),
                            'budget': self._get_activity_budget(activity)
                        }
                        initiative_data['main_activities'].append(activity_data)
                    
                    objective_data['initiatives'].append(initiative_data)
                
                objectives_data.append(objective_data)
                
            except Exception as e:
                logger.exception(f"Error processing objective {objective.id}: {str(e)}")
                continue
        
        logger.info(f"Returning {len(objectives_data)} processed objectives")
        return objectives_data

    def _get_activity_budget(self, activity):
        """Helper method to get formatted budget data for an activity"""
        try:
            if hasattr(activity, 'budget') and activity.budget:
                budget = activity.budget
                return {
                    'id': budget.id,
                    'budget_calculation_type': budget.budget_calculation_type,
                    'activity_type': budget.activity_type,
                    'estimated_cost_with_tool': float(budget.estimated_cost_with_tool or 0),
                    'estimated_cost_without_tool': float(budget.estimated_cost_without_tool or 0),
                    'government_treasury': float(budget.government_treasury or 0),
                    'sdg_funding': float(budget.sdg_funding or 0),
                    'partners_funding': float(budget.partners_funding or 0),
                    'other_funding': float(budget.other_funding or 0),
                }
            return None
        except Exception as e:
            logger.exception(f"Error getting budget data: {str(e)}")
            return None

    def validate(self, data):
        # Validate dates
        if data.get('from_date') and data.get('to_date'):
            if data['from_date'] > data['to_date']:
                raise serializers.ValidationError('From date cannot be later than to date')

        # Validate fiscal year format
        if 'fiscal_year' in data:
            if not data['fiscal_year'].isdigit() or len(data['fiscal_year']) != 4:
                raise serializers.ValidationError('Fiscal year must be a 4-digit number')

        return data

    def to_representation(self, instance):
        try:
            data = super().to_representation(instance)
            
            # Ensure objectives is always an array
            if 'objectives' in data:
                if data['objectives'] is None and instance.strategic_objective:
                    # Rebuild objectives data
                    data['objectives'] = self.get_objectives(instance)
                elif data['objectives'] and not isinstance(data['objectives'], list):
                    # Convert single objective to array
                    data['objectives'] = [data['objectives']]
                elif data['objectives'] is None:
                    # Set empty array if no objectives
                    data['objectives'] = []
            
            return data
        except Exception as e:
            logger.exception(f"Error in PlanSerializer.to_representation: {str(e)}")
            # Return minimal representation to avoid complete failure
            return {
                'id': instance.id,
                'organization': instance.organization_id,
                'organization_name': instance.organization.name if hasattr(instance, 'organization') else 'Unknown',
                'planner_name': instance.planner_name,
                'status': instance.status,
                'from_date': instance.from_date,
                'to_date': instance.to_date,
                'created_at': instance.created_at
            }
