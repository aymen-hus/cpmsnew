from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('organizations', '0015_detailactivity_teamdeskplan_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='plan',
            name='selected_objectives_weights',
            field=models.JSONField(blank=True, help_text='Custom weights assigned by planner for each selected objective {objective_id: weight}', null=True),
        ),
    ]
</anoltAction>