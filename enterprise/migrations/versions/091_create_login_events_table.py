"""Create login_events table for storing reCAPTCHA assessment data.

Revision ID: 091
Revises: 090
Create Date: 2025-01-23
"""

import sqlalchemy as sa
from alembic import op

revision = '091'
down_revision = '090'


def upgrade() -> None:
    op.create_table(
        'login_events',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('recaptcha_assessment_name', sa.String(), nullable=True),
        sa.Column('recaptcha_score', sa.Float(), nullable=True),
        sa.Column('recaptcha_valid', sa.Boolean(), nullable=True),
        sa.Column('recaptcha_allowed', sa.Boolean(), nullable=True),
        sa.Column('user_ip', sa.String(), nullable=True),
        sa.Column('user_agent', sa.String(), nullable=True),
        sa.Column('annotated', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('annotation', sa.String(), nullable=True),
        sa.Column('annotated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], ondelete='CASCADE'),
    )

    # Create index on user_id for faster lookups
    op.create_index(
        'ix_login_events_user_id', 'login_events', ['user_id'], unique=False
    )

    # Create index on recaptcha_assessment_name for annotation lookups
    op.create_index(
        'ix_login_events_recaptcha_assessment_name',
        'login_events',
        ['recaptcha_assessment_name'],
        unique=False,
    )

    # Create index on created_at for time-based queries
    op.create_index(
        'ix_login_events_created_at', 'login_events', ['created_at'], unique=False
    )


def downgrade() -> None:
    op.drop_index('ix_login_events_created_at', table_name='login_events')
    op.drop_index(
        'ix_login_events_recaptcha_assessment_name', table_name='login_events'
    )
    op.drop_index('ix_login_events_user_id', table_name='login_events')
    op.drop_table('login_events')
