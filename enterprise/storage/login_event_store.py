"""
Store for managing LoginEvent records.

Provides methods for creating, querying, and annotating login events
with their associated reCAPTCHA assessment data.
"""

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from storage.login_event import LoginEvent


class LoginEventStore:
    """Store for LoginEvent CRUD operations."""

    @staticmethod
    async def create_login_event(
        session: AsyncSession,
        user_id: UUID,
        recaptcha_assessment_name: str | None = None,
        recaptcha_score: float | None = None,
        recaptcha_valid: bool | None = None,
        recaptcha_allowed: bool | None = None,
        user_ip: str | None = None,
        user_agent: str | None = None,
    ) -> LoginEvent:
        """Create a new login event record.

        Args:
            session: Database session.
            user_id: The user's UUID.
            recaptcha_assessment_name: Full reCAPTCHA assessment resource name.
            recaptcha_score: reCAPTCHA risk score (0.0 to 1.0).
            recaptcha_valid: Whether the reCAPTCHA token was valid.
            recaptcha_allowed: Whether the login was allowed by reCAPTCHA.
            user_ip: The user's IP address.
            user_agent: The user's browser user agent.

        Returns:
            The created LoginEvent record.
        """
        login_event = LoginEvent(
            user_id=user_id,
            recaptcha_assessment_name=recaptcha_assessment_name,
            recaptcha_score=recaptcha_score,
            recaptcha_valid=recaptcha_valid,
            recaptcha_allowed=recaptcha_allowed,
            user_ip=user_ip,
            user_agent=user_agent,
        )
        session.add(login_event)
        await session.commit()
        await session.refresh(login_event)
        return login_event

    @staticmethod
    async def get_by_assessment_name(
        session: AsyncSession, assessment_name: str
    ) -> LoginEvent | None:
        """Find a login event by its reCAPTCHA assessment name.

        Args:
            session: Database session.
            assessment_name: The reCAPTCHA assessment resource name.

        Returns:
            The LoginEvent if found, otherwise None.
        """
        stmt = select(LoginEvent).where(
            LoginEvent.recaptcha_assessment_name == assessment_name
        )
        result = await session.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    async def get_user_login_events(
        session: AsyncSession,
        user_id: UUID,
        limit: int = 100,
    ) -> list[LoginEvent]:
        """Get recent login events for a user.

        Args:
            session: Database session.
            user_id: The user's UUID.
            limit: Maximum number of events to return.

        Returns:
            List of LoginEvent records ordered by created_at descending.
        """
        stmt = (
            select(LoginEvent)
            .where(LoginEvent.user_id == user_id)
            .order_by(LoginEvent.created_at.desc())
            .limit(limit)
        )
        result = await session.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def get_unannotated_events(
        session: AsyncSession,
        limit: int = 100,
    ) -> list[LoginEvent]:
        """Get login events that haven't been annotated yet.

        Args:
            session: Database session.
            limit: Maximum number of events to return.

        Returns:
            List of unannotated LoginEvent records.
        """
        stmt = (
            select(LoginEvent)
            .where(LoginEvent.annotated == False)  # noqa: E712
            .where(LoginEvent.recaptcha_assessment_name.isnot(None))
            .order_by(LoginEvent.created_at.asc())
            .limit(limit)
        )
        result = await session.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def annotate_event(
        session: AsyncSession,
        login_event_id: UUID,
        annotation: str,
    ) -> bool:
        """Mark a login event as annotated with the given annotation.

        Args:
            session: Database session.
            login_event_id: The login event's UUID.
            annotation: The annotation value ('LEGITIMATE' or 'FRAUDULENT').

        Returns:
            True if the event was updated, False if not found.
        """
        stmt = (
            update(LoginEvent)
            .where(LoginEvent.id == login_event_id)
            .values(
                annotated=True,
                annotation=annotation,
                annotated_at=datetime.now(UTC),
            )
        )
        result = await session.execute(stmt)
        await session.commit()
        return result.rowcount > 0

    @staticmethod
    async def annotate_by_assessment_name(
        session: AsyncSession,
        assessment_name: str,
        annotation: str,
    ) -> bool:
        """Mark a login event as annotated by its assessment name.

        Args:
            session: Database session.
            assessment_name: The reCAPTCHA assessment resource name.
            annotation: The annotation value ('LEGITIMATE' or 'FRAUDULENT').

        Returns:
            True if the event was updated, False if not found.
        """
        stmt = (
            update(LoginEvent)
            .where(LoginEvent.recaptcha_assessment_name == assessment_name)
            .values(
                annotated=True,
                annotation=annotation,
                annotated_at=datetime.now(UTC),
            )
        )
        result = await session.execute(stmt)
        await session.commit()
        return result.rowcount > 0
