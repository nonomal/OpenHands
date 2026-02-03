"""
Role-based authorization dependencies for API endpoints.

This module provides FastAPI dependencies for checking user roles
within organizations. It follows the existing pattern established
by get_user_id and get_admin_user_id dependencies.

Usage:
    from server.auth.authorization import (
        require_org_role,
        require_org_user,
        require_org_admin,
        require_org_owner,
        OrgRole,
    )

    @router.get('/{org_id}/resource')
    async def get_resource(
        org_id: UUID,
        user_id: str = Depends(require_org_user),
    ):
        # Only org members (user, admin, or owner) can access
        ...

    @router.patch('/{org_id}/resource')
    async def update_resource(
        org_id: UUID,
        user_id: str = Depends(require_org_admin),
    ):
        # Only admins or owners can access
        ...
"""

from enum import Enum
from uuid import UUID

from fastapi import Depends, HTTPException, status
from storage.org_member_store import OrgMemberStore
from storage.role_store import RoleStore

from openhands.core.logger import openhands_logger as logger
from openhands.server.user_auth import get_user_id


class OrgRole(str, Enum):
    """Organization roles with hierarchy (owner > admin > user)."""

    OWNER = 'owner'
    ADMIN = 'admin'
    USER = 'user'


# Role hierarchy - higher rank = more permissions
ROLE_HIERARCHY: dict[OrgRole, int] = {
    OrgRole.OWNER: 3,
    OrgRole.ADMIN: 2,
    OrgRole.USER: 1,
}


def get_user_org_role(user_id: str, org_id: UUID) -> str | None:
    """
    Get the user's role in an organization.

    Args:
        user_id: User ID (string that will be converted to UUID)
        org_id: Organization ID

    Returns:
        Role name if user is a member, None otherwise
    """
    from uuid import UUID as parse_uuid

    org_member = OrgMemberStore.get_org_member(org_id, parse_uuid(user_id))
    if not org_member:
        return None

    role = RoleStore.get_role_by_id(org_member.role_id)
    return role.name if role else None


def has_required_role(user_role: str, required_role: OrgRole) -> bool:
    """
    Check if user's role meets or exceeds the required role.

    Uses role hierarchy where owner > admin > user.

    Args:
        user_role: User's actual role name
        required_role: Minimum required role

    Returns:
        True if user has sufficient permissions
    """
    try:
        user_role_enum = OrgRole(user_role)
        return ROLE_HIERARCHY.get(user_role_enum, 0) >= ROLE_HIERARCHY.get(
            required_role, 0
        )
    except ValueError:
        return False


def require_org_role(required_role: OrgRole):
    """
    Factory function that creates a dependency to require a minimum org role.

    This creates a FastAPI dependency that:
    1. Extracts org_id from the path parameter
    2. Gets the authenticated user_id
    3. Checks if the user has the required role in the organization
    4. Returns the user_id if authorized, raises HTTPException otherwise

    Usage:
        @router.get('/{org_id}/resource')
        async def get_resource(
            org_id: UUID,
            user_id: str = Depends(require_org_role(OrgRole.USER)),
        ):
            ...

    Args:
        required_role: Minimum required role to access the endpoint

    Returns:
        Dependency function that validates role and returns user_id
    """

    async def role_checker(
        org_id: UUID,
        user_id: str | None = Depends(get_user_id),
    ) -> str:
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail='User not authenticated',
            )

        user_role = get_user_org_role(user_id, org_id)

        if not user_role:
            logger.warning(
                'User not a member of organization',
                extra={'user_id': user_id, 'org_id': str(org_id)},
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail='User is not a member of this organization',
            )

        if not has_required_role(user_role, required_role):
            logger.warning(
                'Insufficient role permissions',
                extra={
                    'user_id': user_id,
                    'org_id': str(org_id),
                    'user_role': user_role,
                    'required_role': required_role.value,
                },
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f'Requires {required_role.value} role or higher',
            )

        return user_id

    return role_checker


# Convenience dependencies for common role checks
require_org_user = require_org_role(OrgRole.USER)
require_org_admin = require_org_role(OrgRole.ADMIN)
require_org_owner = require_org_role(OrgRole.OWNER)
