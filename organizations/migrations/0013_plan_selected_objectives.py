# Generated by Django 4.2.10 on 2025-07-20 21:45

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('organizations', '0012_alter_plan_type'),
    ]

    operations = [
        migrations.AddField(
            model_name='plan',
            name='selected_objectives',
            field=models.ManyToManyField(blank=True, help_text='All objectives selected for this plan', related_name='selected_in_plans', to='organizations.strategicobjective'),
        ),
    ]
