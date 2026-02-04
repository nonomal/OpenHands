"""
SQLAlchemy model for LoginEvent.

Tracks user login events with reCAPTCHA assessment information for later
annotation and fraud analysis.
"""

from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from storage.base import Base


class LoginEvent(Base):  # type: ignore
    """
    Represents a user login event with associated reCAPTCHA assessment data.

    Stores the reCAPTCHA assessment name to enable later annotation via
    Google's reCAPTCHA Enterprise API, providing feedback on whether the
    user was legitimate or fraudulent.
    """

    __tablename__ = 'login_events'

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey('user.id'), nullable=False)

    # reCAPTCHA assessment data
    recaptcha_assessment_name = Column(String, nullable=True)
    recaptcha_score = Column(Float, nullable=True)
    recaptcha_valid = Column(Boolean, nullable=True)
    recaptcha_allowed = Column(Boolean, nullable=True)

    # Login context
    user_ip = Column(String, nullable=True)
    user_agent = Column(String, nullable=True)

    # Annotation tracking
    annotated = Column(Boolean, default=False, nullable=False)
    annotation = Column(String, nullable=True)  # 'LEGITIMATE' or 'FRAUDULENT'
    annotated_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )

    # Relationships
    user = relationship('User', back_populates='login_events')
