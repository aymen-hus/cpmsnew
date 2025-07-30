from django.db import models
from django.core.exceptions import ValidationError
from decimal import Decimal
from django.utils import timezone
from django.core.validators import MinValueValidator, MaxValueValidator

def validate_positive_weight(value):
    if value <= 0:
        raise ValidationError('Weight must be positive')

def validate_max_weight(value):
    if value > 100:
        raise ValidationError('Weight cannot exceed 100')

class Organization(models.Model):
    ORGANIZATION_TYPES = [
        ('MINISTER', 'Minister'),
        ('STATE_MINISTER', 'State Minister'),
        ('CHIEF_EXECUTIVE', 'Chief Executive'),
        ('LEAD_EXECUTIVE', 'Lead Executive'),
        ('EXECUTIVE', 'Executive'),
        ('TEAM_LEAD', 'Team Lead'),
        ('DESK', 'Desk')
    ]
    
    name = models.CharField(max_length=255)
    type = models.CharField(max_length=20, choices=ORGANIZATION_TYPES)
    parent = models.ForeignKey(
        'self', 
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='children'
    )
    vision = models.TextField(null=True, blank=True)
    mission = models.TextField(null=True, blank=True)
    core_values = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def __str__(self):
        return self.name

class OrganizationUser(models.Model):
    ROLES = [
        ('ADMIN', 'Admin'),
        ('PLANNER', 'Planner'),
        ('EVALUATOR', 'Evaluator'),
        ('TEAM_DESK_PLANNER', 'Team/Desk Planner')
    ]
    
    user = models.ForeignKey('auth.User', on_delete=models.CASCADE, related_name='organization_users')
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='users')
    role = models.CharField(max_length=20, choices=ROLES)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        unique_together = ('user', 'organization', 'role')
    
    def __str__(self):
        return f"{self.user.username} - {self.organization.name} ({self.role})"


class StrategicObjective(models.Model):
    title = models.CharField(max_length=255)
    description = models.TextField(null=True, blank=True)
    weight = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        validators=[validate_positive_weight, validate_max_weight]
    )
    is_default = models.BooleanField(default=True, help_text="Whether this objective is a default one created by admin")
    planner_weight = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[validate_positive_weight, validate_max_weight],
        help_text="Custom weight assigned by planner (overrides default weight)"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def clean(self):
        # Validate logic (in addition to field validators)
        super().clean()
        if self.weight <= 0:
            raise ValidationError('Weight must be positive')
        if self.weight > 100:
            raise ValidationError('Weight cannot exceed 100')
        if self.planner_weight is not None:
            if self.planner_weight <= 0:
                raise ValidationError('Planner weight must be positive')
            if self.planner_weight > 100:
                raise ValidationError('Planner weight cannot exceed 100')
    
    def __str__(self):
        return self.title
    
    def get_effective_weight(self):
        """Return the effective weight to use (planner_weight if set, otherwise weight)"""
        if self.planner_weight is not None:
            return self.planner_weight
        return self.weight




class Program(models.Model):
    strategic_objective = models.ForeignKey(
        StrategicObjective,
        on_delete=models.CASCADE,
        related_name='programs'
    )
    name = models.CharField(max_length=255)
    description = models.TextField(null=True, blank=True)
    is_default = models.BooleanField(default=True, help_text="Whether this program is a default one created by admin")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def __str__(self):
        return self.name

class InitiativeFeed(models.Model):
    """
    Model to store initiatives that can be selected when creating plans.
    This provides a list of predefined initiatives that planners can choose from.
    """
    name = models.CharField(max_length=255)
    description = models.TextField(null=True, blank=True)
    strategic_objective = models.ForeignKey(
        StrategicObjective,
        on_delete=models.CASCADE,
        related_name='initiative_feeds',
        null=True,
        blank=True,
        help_text="The strategic objective this initiative feed belongs to"
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def __str__(self):
        return self.name



class StrategicInitiative(models.Model):
    name = models.CharField(max_length=255)
    weight = models.DecimalField(max_digits=5, decimal_places=2)
    strategic_objective = models.ForeignKey(
        StrategicObjective,
        on_delete=models.CASCADE,
        related_name='initiatives',
        null=True,
        blank=True
    )
    program = models.ForeignKey(
        Program,
        on_delete=models.CASCADE,
        related_name='initiatives',
        null=True,
        blank=True
    )
    is_default = models.BooleanField(default=True, help_text="Whether this initiative is a default one created by admin")
    # Add organization field to track which organization created this initiative (for non-default initiatives)
    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name='initiatives',
        null=True,
        blank=True,
        help_text="The organization that created this initiative (only for custom initiatives)"
    )
    # Link to initiative feed if this was created from a predefined initiative
    initiative_feed = models.ForeignKey(
        InitiativeFeed,
        on_delete=models.SET_NULL,
        related_name='strategic_initiatives',
        null=True,
        blank=True,
        help_text="The predefined initiative this was created from"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        constraints = [
            models.CheckConstraint(
                check=models.Q(
                    models.Q(
                        strategic_objective__isnull=False,
                        program__isnull=True
                    ) |
                    models.Q(
                        strategic_objective__isnull=True,
                        program__isnull=False
                    )
                ),
                name='initiative_relation_check'
            ),
        ]
        indexes = [
            models.Index(fields=['program'], name='idx_initiative_program'),
            models.Index(fields=['organization'], name='idx_initiative_organization'),
        ]
    
    def clean(self):
        super().clean()
        
        # Validate the parent relationship
        parent_count = 0
        if self.strategic_objective:
            parent_count += 1
        if self.program:
            parent_count += 1
            
        if parent_count != 1:
            raise ValidationError('Initiative must be linked to exactly one parent: strategic objective or program')
        
        # For non-default initiatives, organization is required
        if not self.is_default and not self.organization:
            raise ValidationError('Organization is required for custom initiatives')
        
        # Check if parent is a default strategic objective with planner_weight
        if self.strategic_objective:
            # Get the effective weight (planner_weight if available, otherwise weight)
            effective_weight = self.strategic_objective.get_effective_weight()
            
            # When parent has planner_weight, ensure initiatives' total weight equals effective_weight
            initiatives = StrategicInitiative.objects.filter(strategic_objective=self.strategic_objective)
            
            # Exclude self if already saved
            if self.pk:
                initiatives = initiatives.exclude(pk=self.pk)
            
            # Calculate total weight of existing initiatives
            total_weight = initiatives.aggregate(models.Sum('weight'))['weight__sum'] or 0
            
            # Add the current initiative's weight
            total_weight += self.weight
            
            # Validate that total weight does not exceed parent's effective weight
            if total_weight > effective_weight:
                raise ValidationError(
                    f"Total initiative weight ({total_weight}) exceeds parent objective's effective weight "
                    f"({effective_weight})"
                )
            
            # For objectives, total weight must equal parent weight exactly
            if abs(total_weight - effective_weight) > 0.01:
                raise ValidationError(
                    f"Total initiative weight ({total_weight}) must equal parent objective's effective weight "
                    f"({effective_weight}) exactly"
                )
    
    def __str__(self):
        return self.name


class PerformanceMeasure(models.Model):
    TARGET_TYPES = [
        ('cumulative', 'Cumulative'),
        ('increasing', 'Increasing'),
        ('decreasing', 'Decreasing'),
        ('constant', 'Constant')
    ]
    
    initiative = models.ForeignKey(
        StrategicInitiative,
        on_delete=models.CASCADE,
        related_name='performance_measures'
    )
    name = models.CharField(max_length=255)
    weight = models.DecimalField(max_digits=5, decimal_places=2)
    baseline = models.CharField(max_length=255, default="", blank=True)
    target_type = models.CharField(
        max_length=20,
        choices=TARGET_TYPES,
        default='cumulative'
    )
    q1_target = models.DecimalField(
        max_digits=10, 
        decimal_places=2,
        default=0,
        verbose_name="Q1 Target (Jul-Sep)"
    )
    q2_target = models.DecimalField(
        max_digits=10, 
        decimal_places=2,
        default=0,
        verbose_name="Q2 Target (Oct-Dec)"
    )
    q3_target = models.DecimalField(
        max_digits=10, 
        decimal_places=2,
        default=0,
        verbose_name="Q3 Target (Jan-Mar)"
    )
    q4_target = models.DecimalField(
        max_digits=10, 
        decimal_places=2,
        default=0,
        verbose_name="Q4 Target (Apr-Jun)"
    )
    annual_target = models.DecimalField(
        max_digits=10, 
        decimal_places=2,
        default=0
    )
    # Add organization field to track which organization created this performance measure
    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name='performance_measures',
        null=True,
        blank=True,
        help_text="The organization that created this performance measure"
    )
    # Add period selection fields
    selected_months = models.JSONField(null=True, blank=True)
    selected_quarters = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def clean(self):
        super().clean()
        
        # Validate weight is positive
        if self.weight <= 0:
            raise ValidationError('Weight must be positive')
        
        # Validate period selection
        if not self.selected_months and not self.selected_quarters:
            raise ValidationError('At least one month or quarter must be selected')
            
        # Initialize empty arrays if fields are None
        if self.selected_months is None:
            self.selected_months = []
        if self.selected_quarters is None:
            self.selected_quarters = []
        
        # Validate targets based on target_type
        if self.target_type == 'cumulative':
            # Sum of quarterly targets should equal annual target
            quarterly_sum = self.q1_target + self.q2_target + self.q3_target + self.q4_target
            if quarterly_sum != self.annual_target:
                raise ValidationError('For cumulative targets, sum of quarterly targets must equal annual target')
        elif self.target_type == 'increasing':
            # Q1 must equal baseline if baseline is set
            if self.baseline and self.baseline.strip():
                try:
                    baseline_value = float(self.baseline)
                    if not self.q1_target >= baseline_value:
                        raise ValidationError(f'For increasing targets, Q1 target ({self.q1_target}) must equal or greater baseline ({baseline_value})')
                except ValueError:
                    pass  # Skip validation if baseline is not a number
            # Targets should be in ascending order
            if not (self.q1_target <= self.q2_target <= self.q3_target <= self.q4_target):
                raise ValidationError('For increasing targets, quarterly targets must be in ascending order (Q1 ≤ Q2 ≤ Q3 ≤ Q4)')
            # Q4 must equal annual target
            if self.q4_target != self.annual_target:
                raise ValidationError('For increasing targets, Q4 target must equal annual target')
        elif self.target_type == 'decreasing':
            # Q1 must equal baseline if baseline is set
            if self.baseline and self.baseline.strip():
                try:
                    baseline_value = float(self.baseline)
                    if not self.q1_target <= baseline_value:
                        raise ValidationError(f'For decreasing targets, Q1 target ({self.q1_target}) must equal or decrease baseline ({baseline_value})')
                except ValueError:
                    pass  # Skip validation if baseline is not a number
            # Targets should be in descending order
            if not (self.q1_target >= self.q2_target >= self.q3_target >= self.q4_target):
                raise ValidationError('For decreasing targets, quarterly targets must be in descending order (Q1 ≥ Q2 ≥ Q3 ≥ Q4)')
            # Q4 must equal annual target
            if self.q4_target != self.annual_target:
                raise ValidationError('For decreasing targets, Q4 target must equal annual target')
        elif self.target_type == 'constant':
            # All quarterly targets must equal annual target
            if not (self.q1_target == self.annual_target and self.q2_target == self.annual_target and 
                   self.q3_target == self.annual_target and self.q4_target == self.annual_target):
                raise ValidationError('For constant targets, all quarterly targets must equal annual target')
        
        
        # Validate measure weight against total for initiative (total should be 35%)
        total_weight = PerformanceMeasure.objects.filter(
            initiative=self.initiative
        ).exclude(id=self.id).aggregate(
            total=models.Sum('weight')
        )['total'] or Decimal('0')
        
        if total_weight + self.weight > 35:
            raise ValidationError(f'Total weight of performance measures ({total_weight + self.weight}%) cannot exceed 35%')

        # For custom performance measures, inherit the organization from the initiative if not set
        if not self.organization and self.initiative and self.initiative.organization:
            self.organization = self.initiative.organization
    
    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)
    
    def __str__(self):
        return self.name



class MainActivity(models.Model):
    TARGET_TYPES = [
        ('cumulative', 'Cumulative'),
        ('increasing', 'Increasing'),
        ('decreasing', 'Decreasing'),
        ('constant', 'Constant')
    ]
    
    initiative = models.ForeignKey(
        StrategicInitiative,
        on_delete=models.CASCADE,
        related_name='main_activities'
    )
    name = models.CharField(max_length=255)
    weight = models.DecimalField(max_digits=5, decimal_places=2)
    baseline = models.CharField(max_length=255, default="", blank=True)
    target_type = models.CharField(
        max_length=20,
        choices=TARGET_TYPES,
        default='cumulative'
    )
    q1_target = models.DecimalField(
        max_digits=10, 
        decimal_places=2,
        default=0,
        verbose_name="Q1 Target (Jul-Sep)"
    )
    q2_target = models.DecimalField(
        max_digits=10, 
        decimal_places=2,
        default=0,
        verbose_name="Q2 Target (Oct-Dec)"
    )
    q3_target = models.DecimalField(
        max_digits=10, 
        decimal_places=2,
        default=0,
        verbose_name="Q3 Target (Jan-Mar)"
    )
    q4_target = models.DecimalField(
        max_digits=10, 
        decimal_places=2,
        default=0,
        verbose_name="Q4 Target (Apr-Jun)"
    )
    annual_target = models.DecimalField(
        max_digits=10, 
        decimal_places=2,
        default=0
    )
    selected_months = models.JSONField(null=True, blank=True)
    selected_quarters = models.JSONField(null=True, blank=True)
    # Add organization field to track which organization created this activity
    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name='main_activities',
        null=True,
        blank=True,
        help_text="The organization that created this activity"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def clean(self):
        super().clean()
        
        # Validate weight is positive
        if self.weight <= 0:
            raise ValidationError('Weight must be positive')
        
        # Validate period selection
        if not self.selected_months and not self.selected_quarters:
            raise ValidationError('At least one month or quarter must be selected')
            
        # Initialize empty arrays if fields are None
        if self.selected_months is None:
            self.selected_months = []
        if self.selected_quarters is None:
            self.selected_quarters = []
        
        # Validate targets based on target_type
        if self.target_type == 'cumulative':
            # Sum of quarterly targets should equal annual target
            quarterly_sum = self.q1_target + self.q2_target + self.q3_target + self.q4_target
            if quarterly_sum != self.annual_target:
                raise ValidationError('For cumulative targets, sum of quarterly targets must equal annual target')
        elif self.target_type == 'increasing':
            # Q1 must equal baseline if baseline is set
            if self.baseline and self.baseline.strip():
                try:
                    baseline_value = float(self.baseline)
                    if not self.q1_target >= baseline_value:
                        raise ValidationError(f'For increasing targets, Q1 target ({self.q1_target}) must equal or greater than baseline ({baseline_value})')
                except ValueError:
                    pass  # Skip validation if baseline is not a number
            # Targets should be in ascending order
            if not (self.q1_target <= self.q2_target <= self.q3_target <= self.q4_target):
                raise ValidationError('For increasing targets, quarterly targets must be in ascending order (Q1 ≤ Q2 ≤ Q3 ≤ Q4)')
            # Q4 must equal annual target
            if self.q4_target != self.annual_target:
                raise ValidationError('For increasing targets, Q4 target must equal annual target')
        elif self.target_type == 'decreasing':
            # Q1 must equal baseline if baseline is set
            if self.baseline and self.baseline.strip():
                try:
                    baseline_value = float(self.baseline)
                    if not self.q1_target <= baseline_value:
                        raise ValidationError(f'For decreasing targets, Q1 target ({self.q1_target}) must equal or lessthan baseline ({baseline_value})')
                except ValueError:
                    pass  # Skip validation if baseline is not a number
            # Targets should be in descending order
            if not (self.q1_target >= self.q2_target >= self.q3_target >= self.q4_target):
                raise ValidationError('For decreasing targets, quarterly targets must be in descending order (Q1 ≥ Q2 ≥ Q3 ≥ Q4)')
            # Q4 must equal annual target
            if self.q4_target != self.annual_target:
                raise ValidationError('For decreasing targets, Q4 target must equal annual target')
        elif self.target_type == 'constant':
            # All quarterly targets must equal annual target
            if not (self.q1_target == self.annual_target and self.q2_target == self.annual_target and 
                   self.q3_target == self.annual_target and self.q4_target == self.annual_target):
                raise ValidationError('For constant targets, all quarterly targets must equal annual target')
        
        
        # Validate activity weight against total for initiative (total should be 65% of initiative weight)
        total_weight = MainActivity.objects.filter(
            initiative=self.initiative
        ).exclude(id=self.id).aggregate(
            total=models.Sum('weight')
        )['total'] or Decimal('0')
        
        # Get the expected weight (65% of initiative weight)
        # initiative_weight = float(self.initiative.weight)
        # max_allowed_weight = round(initiative_weight * 0.65, 2)
        
        # Calculate expected activities weight (65% of initiative weight)
        initiative_weight = float(self.initiative.weight)
        max_allowed_weight = round(initiative_weight * 0.65, 2)
        current_weight = float(self.weight)
        other_activities_weight = float(total_weight)
        total_weight_after = other_activities_weight + current_weight
        if total_weight_after > max_allowed_weight:
             raise ValidationError(
                 f'Total weight of activities ({total_weight_after}) cannot exceed {max_allowed_weight} '
                  f'(65% of initiative weight {initiative_weight})'
             )
        # For custom activities, inherit the organization from the initiative if not set
        if not self.organization and self.initiative and self.initiative.organization:
            self.organization = self.initiative.organization
    
    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)
    
    def __str__(self):
        return self.name


class ActivityBudget(models.Model):
    BUDGET_CALCULATION_TYPES = [
        ('WITH_TOOL', 'With Tool'),
        ('WITHOUT_TOOL', 'Without Tool')
    ]
    
    ACTIVITY_TYPES = [
        ('Training', 'Training'),
        ('Meeting', 'Meeting'),
        ('Workshop', 'Workshop'),
        ('Printing', 'Printing'),
        ('Supervision', 'Supervision'),
        ('Procurement', 'Procurement'),
        ('Other', 'Other')
    ]

    activity = models.OneToOneField(
        'MainActivity',
        on_delete=models.CASCADE,
        related_name='budget'
    )
    budget_calculation_type = models.CharField(
        max_length=20,
        choices=BUDGET_CALCULATION_TYPES,
        default='WITHOUT_TOOL'
    )
    activity_type = models.CharField(
        max_length=20,
        choices=ACTIVITY_TYPES,
        null=True,
        blank=True
    )
    estimated_cost_with_tool = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0
    )
    estimated_cost_without_tool = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0
    )
    government_treasury = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0
    )
    sdg_funding = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0
    )
    partners_funding = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0
    )
    other_funding = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0
    )
    training_details = models.JSONField(null=True, blank=True)
    meeting_workshop_details = models.JSONField(null=True, blank=True)
    procurement_details = models.JSONField(null=True, blank=True)
    printing_details = models.JSONField(null=True, blank=True)
    supervision_details = models.JSONField(null=True, blank=True)
    partners_details = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def clean(self):
        super().clean()

        # Get the estimated cost based on calculation type
        estimated_cost = (
            self.estimated_cost_with_tool 
            if self.budget_calculation_type == 'WITH_TOOL'
            else self.estimated_cost_without_tool
        )

        # Calculate total funding
        total_funding = (
            self.government_treasury +
            self.sdg_funding +
            self.partners_funding +
            self.other_funding
        )

        # Validate total funding against estimated cost
        if total_funding > estimated_cost:
            raise ValidationError(
                f'Total funding ({total_funding}) cannot exceed estimated cost ({estimated_cost})'
            )

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Budget for {self.activity.name}"

    @property
    def total_funding(self):
        return (
            self.government_treasury +
            self.sdg_funding +
            self.partners_funding +
            self.other_funding
        )

    @property
    def estimated_cost(self):
        return (
            self.estimated_cost_with_tool 
            if self.budget_calculation_type == 'WITH_TOOL'
            else self.estimated_cost_without_tool
        )

    @property
    def funding_gap(self):
        return self.estimated_cost - self.total_funding

class ActivityCostingAssumption(models.Model):
    ACTIVITY_TYPES = [
        ('Training', 'Training'),
        ('Meeting', 'Meeting'),
        ('Workshop', 'Workshop'),
        ('Printing', 'Printing'),
        ('Supervision', 'Supervision'),
        ('Procurement', 'Procurement'),
        ('Other', 'Other')
    ]

    LOCATIONS = [
        ('Addis_Ababa', 'Addis Ababa'),
        ('Adama', 'Adama'),
        ('Bahirdar', 'Bahirdar'),
        ('Mekele', 'Mekele'),
        ('Hawassa', 'Hawassa'),
        ('Gambella', 'Gambella'),
        ('Afar', 'Afar'),
        ('Somali', 'Somali')
    ]

    COST_TYPES = [
        ('per_diem', 'Per Diem'),
        ('accommodation', 'Accommodation'),
        ('venue', 'Venue'),
        ('transport_land', 'Land Transport'),
        ('transport_air', 'Air Transport'),
        ('participant_flash_disk', 'Flash Disk (per participant)'),
        ('participant_stationary', 'Stationary (per participant)'),
        ('session_flip_chart', 'Flip Chart (per session)'),
        ('session_marker', 'Marker (per session)'),
        ('session_toner_paper', 'Toner and Paper (per session)')
    ]

    activity_type = models.CharField(max_length=20, choices=ACTIVITY_TYPES)
    location = models.CharField(max_length=20, choices=LOCATIONS)
    cost_type = models.CharField(max_length=30, choices=COST_TYPES)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    description = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('activity_type', 'location', 'cost_type')
        
    def __str__(self):
        return f"{self.activity_type} - {self.location} - {self.cost_type}: {self.amount}"


class Location(models.Model):
    """
    Model for storing locations (cities, regions) for costing
    """
    REGIONS = [
        ('Addis Ababa', 'Addis Ababa'),
        ('Diredawa', 'Diredawa'),
        ('Afar', 'Afar'),
        ('Amhara', 'Amhara'),
        ('Benishangul-Gumuz', 'Benishangul-Gumuz'),
        ('Central Ethiopia', 'Central Ethiopia'),
        ('Gambela', 'Gambela'),
        ('Harari', 'Harari'),
        ('Oromia', 'Oromia'),
        ('Sidama', 'Sidama'),
        ('Somali', 'Somali'),
        ('South Ethiopia', 'South Ethiopia'),
        ('Southwest', 'Southwest'),
        ('Tigray', 'Tigray')
    ]
    
    name = models.CharField(max_length=255)
    region = models.CharField(max_length=255, choices=REGIONS)
    is_hardship_area = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def __str__(self):
        return f"{self.name}, {self.region}"

class LandTransport(models.Model):
    """
    Model for land transport costing
    """
    TRIP_TYPES = [
        ('SINGLE', 'Single Trip'),
        ('ROUND', 'Round Trip')
    ]
    
    origin = models.ForeignKey(Location, on_delete=models.CASCADE, related_name='land_transport_origins')
    destination = models.ForeignKey(Location, on_delete=models.CASCADE, related_name='land_transport_destinations')
    trip_type = models.CharField(max_length=10, choices=TRIP_TYPES, default='SINGLE')
    price = models.DecimalField(max_digits=10, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def __str__(self):
        trip = "Round Trip" if self.trip_type == 'ROUND' else "Single Trip"
        return f"{self.origin} to {self.destination} ({trip}): {self.price}"

class AirTransport(models.Model):
    """
    Model for air transport costing
    """
    origin = models.ForeignKey(Location, on_delete=models.CASCADE, related_name='air_transport_origins')
    destination = models.ForeignKey(Location, on_delete=models.CASCADE, related_name='air_transport_destinations')
    price = models.DecimalField(max_digits=10, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def __str__(self):
        return f"{self.origin} to {self.destination}: {self.price}"

class PerDiem(models.Model):
    """
    Model for per diem costing
    """
    location = models.ForeignKey(Location, on_delete=models.CASCADE, related_name='per_diems')
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    hardship_allowance_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def __str__(self):
        return f"Per Diem for {self.location}: {self.amount}"

class Accommodation(models.Model):
    """
    Model for accommodation costing
    """
    SERVICE_TYPES = [
        ('LUNCH', 'Lunch'),
        ('HALL_REFRESHMENT', 'Hall with Refreshment'),
        ('DINNER', 'Dinner'),
        ('BED', 'Bed'),
        ('FULL_BOARD', 'Full Board')
    ]
    
    location = models.ForeignKey(Location, on_delete=models.CASCADE, related_name='accommodations')
    service_type = models.CharField(max_length=20, choices=SERVICE_TYPES)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def __str__(self):
        return f"{self.service_type} at {self.location}: {self.price}"

class ParticipantCost(models.Model):
    """
    Model for participant costs
    """
    TYPE_CHOICES = [
        ('FLASH_DISK', 'Flash Disk'),
        ('STATIONARY', 'Stationary'),
        ('ALL', 'All')
    ]
    
    cost_type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def __str__(self):
        return f"{self.get_cost_type_display()}: {self.price}"

class SessionCost(models.Model):
    """
    Model for session costs
    """
    TYPE_CHOICES = [
        ('FLIP_CHART', 'Flip Chart'),
        ('MARKER', 'Marker'),
        ('TONER_PAPER', 'Toner and Paper'),
        ('ALL', 'All')
    ]
    
    cost_type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def __str__(self):
        return f"{self.get_cost_type_display()}: {self.price}"

class PrintingCost(models.Model):
    """
    Model for printing costs
    """
    DOCUMENT_TYPES = [
        ('MANUAL', 'Manual/Guidelines'),
        ('BOOKLET', 'Booklet'),
        ('LEAFLET', 'Leaflet'),
        ('BROCHURE', 'Brochure')
    ]
    
    document_type = models.CharField(max_length=20, choices=DOCUMENT_TYPES)
    price_per_page = models.DecimalField(max_digits=10, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def __str__(self):
        return f"{self.get_document_type_display()}: {self.price_per_page} per page"

class SupervisorCost(models.Model): 
    """
    Model for supervisor costs
    """
    TYPE_CHOICES = [
        ('MOBILE_CARD_300', 'Mobile Card (300 birr)'),
        ('MOBILE_CARD_500', 'Mobile Card (500 birr)'),
        ('STATIONARY', 'Stationary (Writing Pad and Pen)'),
        ('ALL', 'All')
    ]
    
    cost_type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def __str__(self):
        return f"{self.get_cost_type_display()}: {self.amount}"

class ProcurementItem(models.Model):
    """
    Model for procurement items with their costs
    """
    CATEGORY_CHOICES = [
        ('OFFICE_SUPPLIES', 'Office Supplies'),
        ('COMPUTER_EQUIPMENT', 'Computer Equipment'),
        ('FURNITURE', 'Furniture'),
        ('CLEANING_SUPPLIES', 'Cleaning Supplies'),
        ('COMMUNICATION', 'Communication'),
        ('STATIONERY', 'Stationery'),
        ('ELECTRONICS', 'Electronics'),
        ('MEDICAL_SUPPLIES', 'Medical Supplies'),
        ('TRANSPORTATION', 'Transportation'),
        ('OTHER', 'Other')
    ]
    
    UNIT_CHOICES = [
        ('PIECE', 'Piece'),
        ('BOX', 'Box'),
        ('PACK', 'Pack'),
        ('SET', 'Set'),
        ('UNIT', 'Unit'),
        ('DOZEN', 'Dozen'),
        ('KILOGRAM', 'Kilogram'),
        ('METER', 'Meter'),
        ('LITER', 'Liter'),
        ('EACH', 'Each')
    ]
    
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES)
    name = models.CharField(max_length=255)
    unit = models.CharField(max_length=20, choices=UNIT_CHOICES)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        unique_together = ('category', 'name', 'unit')
        ordering = ['category', 'name']
    
    def __str__(self):
        return f"{self.name} ({self.get_unit_display()}) - ETB {self.unit_price}"



class Plan(models.Model):
    PLAN_TYPES = [
        ('LEO/EO Plan', 'LEO/EO Plan'),
        ('Desk/Team Plan', 'Desk/Team Plan'),
        ('Individual Plan ', 'Individual Plan ')
    ]
    
    PLAN_STATUS = [
        ('DRAFT', 'Draft'),
        ('SUBMITTED', 'Submitted'),
        ('APPROVED', 'Approved'),
        ('REJECTED', 'Rejected')
    ]
    
    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name='plans'
    )
    planner_name = models.CharField(max_length=255)
    type = models.CharField(max_length=20, choices=PLAN_TYPES)
    executive_name = models.CharField(max_length=255, null=True, blank=True)
    strategic_objective = models.ForeignKey(
        StrategicObjective,
        on_delete=models.CASCADE,
        related_name='plans'
    )
    # Add many-to-many field to store all selected objectives
    selected_objectives = models.ManyToManyField(
        StrategicObjective,
        related_name='selected_in_plans',
        blank=True,
        help_text="All objectives selected for this plan"
    )
    program = models.ForeignKey(
        Program,
        on_delete=models.CASCADE,
        related_name='plans',
        null=True,
        blank=True
    )
    fiscal_year = models.CharField(max_length=10)
    from_date = models.DateField()
    to_date = models.DateField()
    status = models.CharField(
        max_length=20, 
        choices=PLAN_STATUS,
        default='DRAFT'
    )
    submitted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def __str__(self):
        return f"{self.organization.name} - {self.strategic_objective} - {self.fiscal_year}"
        
    # Method to clean the plan data and prevent duplicate submissions
    def clean(self):
        super().clean()
        
        # Validate date range
        if self.to_date <= self.from_date:
            raise ValidationError('End date must be after start date')
            
        # Make sure we have at least one of strategic_objective, program
        if not self.strategic_objective and not self.program:
            raise ValidationError('At least one of strategic objective or program must be specified')
            
        # If submitting a plan, check for duplicate submissions
        if self.status == 'SUBMITTED' or self.status == 'APPROVED':
            # Check for existing approved/submitted plans with same organization + objective/program
            existing_plans = Plan.objects.filter(
                organization=self.organization,
                strategic_objective=self.strategic_objective,
                status__in=['SUBMITTED', 'APPROVED']
            ).exclude(id=self.id)
            
            if existing_plans.exists():
                raise ValidationError(
                    'A plan for this organization and strategic objective has already been submitted or approved'
                )
    
    def save(self, *args, **kwargs):
        # Set submitted_at timestamp when status changes to SUBMITTED
        if self.status == 'SUBMITTED' and not self.submitted_at:
            self.submitted_at = timezone.now()
            
        self.clean()
        super().save(*args, **kwargs)

class PlanReview(models.Model):
    REVIEW_STATUS = [
        ('APPROVED', 'Approved'),
        ('REJECTED', 'Rejected')
    ]
    
    plan = models.ForeignKey(
        Plan,
        on_delete=models.CASCADE,
        related_name='reviews'
    )
    evaluator = models.ForeignKey(
        OrganizationUser,
        on_delete=models.SET_NULL,
        null=True,
        related_name='reviews'
    )
    status = models.CharField(max_length=20, choices=REVIEW_STATUS)
    feedback = models.TextField()
    reviewed_at = models.DateTimeField(default=timezone.now)  # Set default to current time
    
    def clean(self):
        super().clean()
        
        # Make sure reviewed_at is set
        if not self.reviewed_at:
            self.reviewed_at = timezone.now()
            
        # Make sure plan status is SUBMITTED
        if self.plan.status != 'SUBMITTED':
            raise ValidationError('Can only review plans with SUBMITTED status')
            
        # Make sure evaluator has EVALUATOR role
        if self.evaluator and self.evaluator.role != 'EVALUATOR':
            raise ValidationError('Only users with EVALUATOR role can review plans')
    
    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)
    
    def __str__(self):
        return f"Review of {self.plan} by {self.evaluator.user.username}" if self.evaluator else f"Review of {self.plan}"
    


class DetailActivity(models.Model):
    TARGET_TYPES = [
        ('cumulative', 'Cumulative'),
        ('increasing', 'Increasing'),
        ('decreasing', 'Decreasing'),
        ('constant', 'Constant')
    ]
    
    main_activity = models.ForeignKey(
        MainActivity,
        on_delete=models.CASCADE,
        related_name='detail_activities'
    )
    name = models.CharField(max_length=255)
    weight = models.DecimalField(
        max_digits=5, 
        decimal_places=2,
        validators=[MinValueValidator(0.01), MaxValueValidator(100)]
    )
    baseline = models.CharField(max_length=255, default="", blank=True)
    target_type = models.CharField(
        max_length=20,
        choices=TARGET_TYPES,
        default='cumulative'
    )
    q1_target = models.DecimalField(
        max_digits=10, 
        decimal_places=2,
        default=0,
        verbose_name="Q1 Target (Jul-Sep)"
    )
    q2_target = models.DecimalField(
        max_digits=10, 
        decimal_places=2,
        default=0,
        verbose_name="Q2 Target (Oct-Dec)"
    )
    q3_target = models.DecimalField(
        max_digits=10, 
        decimal_places=2,
        default=0,
        verbose_name="Q3 Target (Jan-Mar)"
    )
    q4_target = models.DecimalField(
        max_digits=10, 
        decimal_places=2,
        default=0,
        verbose_name="Q4 Target (Apr-Jun)"
    )
    annual_target = models.DecimalField(
        max_digits=10, 
        decimal_places=2,
        default=0
    )
    selected_months = models.JSONField(null=True, blank=True)
    selected_quarters = models.JSONField(null=True, blank=True)
    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name='detail_activities',
        help_text="The team/desk organization that created this detail activity"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def clean(self):
        super().clean()
        
        # Validate weight is positive
        if self.weight <= 0:
            raise ValidationError('Weight must be positive')
        
        # Validate period selection
        if not self.selected_months and not self.selected_quarters:
            raise ValidationError('At least one month or quarter must be selected')
            
        # Initialize empty arrays if fields are None
        if self.selected_months is None:
            self.selected_months = []
        if self.selected_quarters is None:
            self.selected_quarters = []
        
        # Validate targets based on target_type
        if self.target_type == 'cumulative':
            quarterly_sum = self.q1_target + self.q2_target + self.q3_target + self.q4_target
            if quarterly_sum != self.annual_target:
                raise ValidationError('For cumulative targets, sum of quarterly targets must equal annual target')
        elif self.target_type == 'increasing':
            if self.baseline and self.baseline.strip():
                try:
                    baseline_value = float(self.baseline)
                    if self.q1_target != baseline_value:
                        raise ValidationError(f'For increasing targets, Q1 target must equal baseline')
                except ValueError:
                    pass
            if not (self.q1_target <= self.q2_target <= self.q3_target <= self.q4_target):
                raise ValidationError('For increasing targets, quarterly targets must be in ascending order')
            if self.q4_target != self.annual_target:
                raise ValidationError('For increasing targets, Q4 target must equal annual target')
        elif self.target_type == 'decreasing':
            if self.baseline and self.baseline.strip():
                try:
                    baseline_value = float(self.baseline)
                    if self.q1_target != baseline_value:
                        raise ValidationError(f'For decreasing targets, Q1 target must equal baseline')
                except ValueError:
                    pass
            if not (self.q1_target >= self.q2_target >= self.q3_target >= self.q4_target):
                raise ValidationError('For decreasing targets, quarterly targets must be in descending order')
            if self.q4_target != self.annual_target:
                raise ValidationError('For decreasing targets, Q4 target must equal annual target')
        elif self.target_type == 'constant':
            if not (self.q1_target == self.annual_target and self.q2_target == self.annual_target and 
                   self.q3_target == self.annual_target and self.q4_target == self.annual_target):
                raise ValidationError('For constant targets, all quarterly targets must equal annual target')
        
        # Validate detail activity weight against main activity weight
        detail_activities = DetailActivity.objects.filter(
            main_activity=self.main_activity
        ).exclude(id=self.id)
        
        total_weight = detail_activities.aggregate(
            total=models.Sum('weight')
        )['total'] or Decimal('0')
        
        if total_weight + self.weight > self.main_activity.weight:
            raise ValidationError(
                f'Total detail activities weight ({total_weight + self.weight}%) cannot exceed '
                f'main activity weight ({self.main_activity.weight}%)'
            )
    
    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)
    
    def __str__(self):
        return self.name

class TeamDeskPlan(models.Model):
    PLAN_STATUS = [
        ('DRAFT', 'Draft'),
        ('SUBMITTED', 'Submitted'),
        ('APPROVED', 'Approved'),
        ('REJECTED', 'Rejected')
    ]
    
    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name='team_desk_plans',
        help_text="The organization this team/desk plan belongs to"
    )
    team_desk = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name='desk_plans',
        help_text="The specific team/desk creating this plan"
    )
    leo_eo_plan = models.ForeignKey(
        Plan,
        on_delete=models.CASCADE,
        related_name='team_desk_plans',
        help_text="The approved LEO/EO plan this is based on"
    )
    objectives = models.ManyToManyField(
        StrategicObjective,
        related_name='team_desk_plans',
        blank=True
    )
    initiatives = models.ManyToManyField(
        StrategicInitiative,
        related_name='team_desk_plans',
        blank=True
    )
    performance_measures = models.ManyToManyField(
        PerformanceMeasure,
        related_name='team_desk_plans',
        blank=True
    )
    main_activities = models.ManyToManyField(
        MainActivity,
        related_name='team_desk_plans',
        blank=True
    )
    detail_activities = models.ManyToManyField(
        DetailActivity,
        related_name='team_desk_plans',
        blank=True
    )
    status = models.CharField(
        max_length=20, 
        choices=PLAN_STATUS,
        default='DRAFT'
    )
    submitted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def clean(self):
        super().clean()
        
        # Validate that team_desk is actually a TEAM_LEAD or DESK organization
        if self.team_desk and self.team_desk.type not in ['TEAM_LEAD', 'DESK']:
            raise ValidationError('Team/Desk must be of type TEAM_LEAD or DESK')
        
        # Validate that leo_eo_plan is approved
        if self.leo_eo_plan and self.leo_eo_plan.status != 'APPROVED':
            raise ValidationError('LEO/EO plan must be approved before creating team/desk plan')
    
    def save(self, *args, **kwargs):
        # Set submitted_at timestamp when status changes to SUBMITTED
        if self.status == 'SUBMITTED' and not self.submitted_at:
            self.submitted_at = timezone.now()
            
        self.clean()
        super().save(*args, **kwargs)
    
    def __str__(self):
        return f"{self.team_desk.name} - Team/Desk Plan"


class TeamDeskPlanReview(models.Model):
    REVIEW_STATUS = [
        ('APPROVED', 'Approved'),
        ('REJECTED', 'Rejected')
    ]
    
    plan = models.ForeignKey(
        TeamDeskPlan,
        on_delete=models.CASCADE,
        related_name='reviews'
    )
    reviewer = models.ForeignKey(
        OrganizationUser,
        on_delete=models.SET_NULL,
        null=True,
        related_name='team_desk_reviews'
    )
    status = models.CharField(max_length=20, choices=REVIEW_STATUS)
    feedback = models.TextField()
    reviewed_at = models.DateTimeField(default=timezone.now)
    
    def clean(self):
        super().clean()
        
        # Make sure reviewed_at is set
        if not self.reviewed_at:
            self.reviewed_at = timezone.now()
            
        # Make sure plan status is SUBMITTED
        if self.plan.status != 'SUBMITTED':
            raise ValidationError('Can only review plans with SUBMITTED status')
            
        # Make sure reviewer has ADMIN role
        if self.reviewer and self.reviewer.role != 'ADMIN':
            raise ValidationError('Only users with ADMIN role can review team/desk plans')
    
    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)
    
    def __str__(self):
        return f"Review of {self.plan} by {self.reviewer.user.username}" if self.reviewer else f"Review of {self.plan}"
