"""
Unit tests for role-based authorization (authorization.py).

Tests the FastAPI dependencies that validate user roles within organizations.
"""

from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException
from server.auth.authorization import (
    OrgRole,
    ROLE_HIERARCHY,
    get_user_org_role,
    has_required_role,
    require_org_role,
    require_org_user,
    require_org_admin,
    require_org_owner,
)


# =============================================================================
# Tests for OrgRole enum
# =============================================================================


class TestOrgRole:
    """Tests for OrgRole enum."""

    def test_org_role_values(self):
        """
        GIVEN: OrgRole enum
        WHEN: Accessing role values
        THEN: All expected roles exist with correct string values
        """
        assert OrgRole.OWNER.value == 'owner'
        assert OrgRole.ADMIN.value == 'admin'
        assert OrgRole.USER.value == 'user'

    def test_org_role_from_string(self):
        """
        GIVEN: Valid role string
        WHEN: Creating OrgRole from string
        THEN: Correct enum value is returned
        """
        assert OrgRole('owner') == OrgRole.OWNER
        assert OrgRole('admin') == OrgRole.ADMIN
        assert OrgRole('user') == OrgRole.USER

    def test_org_role_invalid_string(self):
        """
        GIVEN: Invalid role string
        WHEN: Creating OrgRole from string
        THEN: ValueError is raised
        """
        with pytest.raises(ValueError):
            OrgRole('invalid_role')


# =============================================================================
# Tests for role hierarchy
# =============================================================================


class TestRoleHierarchy:
    """Tests for role hierarchy constants."""

    def test_owner_highest_rank(self):
        """
        GIVEN: Role hierarchy
        WHEN: Comparing role ranks
        THEN: Owner has highest rank
        """
        assert ROLE_HIERARCHY[OrgRole.OWNER] > ROLE_HIERARCHY[OrgRole.ADMIN]
        assert ROLE_HIERARCHY[OrgRole.OWNER] > ROLE_HIERARCHY[OrgRole.USER]

    def test_admin_middle_rank(self):
        """
        GIVEN: Role hierarchy
        WHEN: Comparing role ranks
        THEN: Admin is between owner and user
        """
        assert ROLE_HIERARCHY[OrgRole.ADMIN] > ROLE_HIERARCHY[OrgRole.USER]
        assert ROLE_HIERARCHY[OrgRole.ADMIN] < ROLE_HIERARCHY[OrgRole.OWNER]

    def test_user_lowest_rank(self):
        """
        GIVEN: Role hierarchy
        WHEN: Comparing role ranks
        THEN: User has lowest rank
        """
        assert ROLE_HIERARCHY[OrgRole.USER] < ROLE_HIERARCHY[OrgRole.ADMIN]
        assert ROLE_HIERARCHY[OrgRole.USER] < ROLE_HIERARCHY[OrgRole.OWNER]


# =============================================================================
# Tests for has_required_role function
# =============================================================================


class TestHasRequiredRole:
    """Tests for has_required_role function."""

    def test_owner_has_owner_role(self):
        """
        GIVEN: User with owner role
        WHEN: Checking for owner requirement
        THEN: Returns True
        """
        assert has_required_role('owner', OrgRole.OWNER) is True

    def test_owner_has_admin_role(self):
        """
        GIVEN: User with owner role
        WHEN: Checking for admin requirement
        THEN: Returns True (owner > admin)
        """
        assert has_required_role('owner', OrgRole.ADMIN) is True

    def test_owner_has_user_role(self):
        """
        GIVEN: User with owner role
        WHEN: Checking for user requirement
        THEN: Returns True (owner > user)
        """
        assert has_required_role('owner', OrgRole.USER) is True

    def test_admin_has_admin_role(self):
        """
        GIVEN: User with admin role
        WHEN: Checking for admin requirement
        THEN: Returns True
        """
        assert has_required_role('admin', OrgRole.ADMIN) is True

    def test_admin_has_user_role(self):
        """
        GIVEN: User with admin role
        WHEN: Checking for user requirement
        THEN: Returns True (admin > user)
        """
        assert has_required_role('admin', OrgRole.USER) is True

    def test_admin_lacks_owner_role(self):
        """
        GIVEN: User with admin role
        WHEN: Checking for owner requirement
        THEN: Returns False (admin < owner)
        """
        assert has_required_role('admin', OrgRole.OWNER) is False

    def test_user_has_user_role(self):
        """
        GIVEN: User with user role
        WHEN: Checking for user requirement
        THEN: Returns True
        """
        assert has_required_role('user', OrgRole.USER) is True

    def test_user_lacks_admin_role(self):
        """
        GIVEN: User with user role
        WHEN: Checking for admin requirement
        THEN: Returns False (user < admin)
        """
        assert has_required_role('user', OrgRole.ADMIN) is False

    def test_user_lacks_owner_role(self):
        """
        GIVEN: User with user role
        WHEN: Checking for owner requirement
        THEN: Returns False (user < owner)
        """
        assert has_required_role('user', OrgRole.OWNER) is False

    def test_invalid_role_returns_false(self):
        """
        GIVEN: Invalid role string
        WHEN: Checking for any requirement
        THEN: Returns False
        """
        assert has_required_role('invalid_role', OrgRole.USER) is False
        assert has_required_role('invalid_role', OrgRole.ADMIN) is False
        assert has_required_role('invalid_role', OrgRole.OWNER) is False


# =============================================================================
# Tests for get_user_org_role function
# =============================================================================


class TestGetUserOrgRole:
    """Tests for get_user_org_role function."""

    def test_returns_role_when_member_exists(self):
        """
        GIVEN: User is a member of organization with role
        WHEN: get_user_org_role is called
        THEN: Role name is returned
        """
        user_id = str(uuid4())
        org_id = uuid4()

        mock_org_member = MagicMock()
        mock_org_member.role_id = 1

        mock_role = MagicMock()
        mock_role.name = 'admin'

        with (
            patch(
                'server.auth.authorization.OrgMemberStore.get_org_member',
                return_value=mock_org_member,
            ),
            patch(
                'server.auth.authorization.RoleStore.get_role_by_id',
                return_value=mock_role,
            ),
        ):
            result = get_user_org_role(user_id, org_id)
            assert result == 'admin'

    def test_returns_none_when_not_member(self):
        """
        GIVEN: User is not a member of organization
        WHEN: get_user_org_role is called
        THEN: None is returned
        """
        user_id = str(uuid4())
        org_id = uuid4()

        with patch(
            'server.auth.authorization.OrgMemberStore.get_org_member',
            return_value=None,
        ):
            result = get_user_org_role(user_id, org_id)
            assert result is None

    def test_returns_none_when_role_not_found(self):
        """
        GIVEN: User is member but role not found
        WHEN: get_user_org_role is called
        THEN: None is returned
        """
        user_id = str(uuid4())
        org_id = uuid4()

        mock_org_member = MagicMock()
        mock_org_member.role_id = 999  # Non-existent role

        with (
            patch(
                'server.auth.authorization.OrgMemberStore.get_org_member',
                return_value=mock_org_member,
            ),
            patch(
                'server.auth.authorization.RoleStore.get_role_by_id',
                return_value=None,
            ),
        ):
            result = get_user_org_role(user_id, org_id)
            assert result is None


# =============================================================================
# Tests for require_org_role dependency
# =============================================================================


class TestRequireOrgRole:
    """Tests for require_org_role dependency factory."""

    @pytest.mark.asyncio
    async def test_returns_user_id_when_authorized(self):
        """
        GIVEN: User with sufficient role
        WHEN: Role checker is called
        THEN: User ID is returned
        """
        user_id = str(uuid4())
        org_id = uuid4()

        with patch(
            'server.auth.authorization.get_user_org_role',
            return_value='admin',
        ):
            role_checker = require_org_role(OrgRole.USER)
            result = await role_checker(org_id=org_id, user_id=user_id)
            assert result == user_id

    @pytest.mark.asyncio
    async def test_raises_401_when_not_authenticated(self):
        """
        GIVEN: No user ID (not authenticated)
        WHEN: Role checker is called
        THEN: 401 Unauthorized is raised
        """
        org_id = uuid4()

        role_checker = require_org_role(OrgRole.USER)
        with pytest.raises(HTTPException) as exc_info:
            await role_checker(org_id=org_id, user_id=None)

        assert exc_info.value.status_code == 401
        assert 'not authenticated' in exc_info.value.detail.lower()

    @pytest.mark.asyncio
    async def test_raises_403_when_not_member(self):
        """
        GIVEN: User is not a member of organization
        WHEN: Role checker is called
        THEN: 403 Forbidden is raised
        """
        user_id = str(uuid4())
        org_id = uuid4()

        with patch(
            'server.auth.authorization.get_user_org_role',
            return_value=None,
        ):
            role_checker = require_org_role(OrgRole.USER)
            with pytest.raises(HTTPException) as exc_info:
                await role_checker(org_id=org_id, user_id=user_id)

            assert exc_info.value.status_code == 403
            assert 'not a member' in exc_info.value.detail.lower()

    @pytest.mark.asyncio
    async def test_raises_403_when_insufficient_role(self):
        """
        GIVEN: User with insufficient role
        WHEN: Role checker is called
        THEN: 403 Forbidden is raised
        """
        user_id = str(uuid4())
        org_id = uuid4()

        with patch(
            'server.auth.authorization.get_user_org_role',
            return_value='user',
        ):
            role_checker = require_org_role(OrgRole.ADMIN)
            with pytest.raises(HTTPException) as exc_info:
                await role_checker(org_id=org_id, user_id=user_id)

            assert exc_info.value.status_code == 403
            assert 'admin' in exc_info.value.detail.lower()

    @pytest.mark.asyncio
    async def test_owner_satisfies_admin_requirement(self):
        """
        GIVEN: User with owner role
        WHEN: Admin role is required
        THEN: User ID is returned (owner > admin)
        """
        user_id = str(uuid4())
        org_id = uuid4()

        with patch(
            'server.auth.authorization.get_user_org_role',
            return_value='owner',
        ):
            role_checker = require_org_role(OrgRole.ADMIN)
            result = await role_checker(org_id=org_id, user_id=user_id)
            assert result == user_id

    @pytest.mark.asyncio
    async def test_logs_warning_on_insufficient_role(self):
        """
        GIVEN: User with insufficient role
        WHEN: Role checker is called
        THEN: Warning is logged with details
        """
        user_id = str(uuid4())
        org_id = uuid4()

        with (
            patch(
                'server.auth.authorization.get_user_org_role',
                return_value='user',
            ),
            patch('server.auth.authorization.logger') as mock_logger,
        ):
            role_checker = require_org_role(OrgRole.OWNER)
            with pytest.raises(HTTPException):
                await role_checker(org_id=org_id, user_id=user_id)

            mock_logger.warning.assert_called()
            call_args = mock_logger.warning.call_args
            assert call_args[1]['extra']['user_id'] == user_id
            assert call_args[1]['extra']['user_role'] == 'user'
            assert call_args[1]['extra']['required_role'] == 'owner'


# =============================================================================
# Tests for convenience dependencies
# =============================================================================


class TestConvenienceDependencies:
    """Tests for pre-configured convenience dependencies."""

    @pytest.mark.asyncio
    async def test_require_org_user_allows_user(self):
        """
        GIVEN: User with user role
        WHEN: require_org_user is used
        THEN: User ID is returned
        """
        user_id = str(uuid4())
        org_id = uuid4()

        with patch(
            'server.auth.authorization.get_user_org_role',
            return_value='user',
        ):
            result = await require_org_user(org_id=org_id, user_id=user_id)
            assert result == user_id

    @pytest.mark.asyncio
    async def test_require_org_admin_allows_admin(self):
        """
        GIVEN: User with admin role
        WHEN: require_org_admin is used
        THEN: User ID is returned
        """
        user_id = str(uuid4())
        org_id = uuid4()

        with patch(
            'server.auth.authorization.get_user_org_role',
            return_value='admin',
        ):
            result = await require_org_admin(org_id=org_id, user_id=user_id)
            assert result == user_id

    @pytest.mark.asyncio
    async def test_require_org_admin_rejects_user(self):
        """
        GIVEN: User with user role
        WHEN: require_org_admin is used
        THEN: 403 Forbidden is raised
        """
        user_id = str(uuid4())
        org_id = uuid4()

        with patch(
            'server.auth.authorization.get_user_org_role',
            return_value='user',
        ):
            with pytest.raises(HTTPException) as exc_info:
                await require_org_admin(org_id=org_id, user_id=user_id)

            assert exc_info.value.status_code == 403

    @pytest.mark.asyncio
    async def test_require_org_owner_allows_owner(self):
        """
        GIVEN: User with owner role
        WHEN: require_org_owner is used
        THEN: User ID is returned
        """
        user_id = str(uuid4())
        org_id = uuid4()

        with patch(
            'server.auth.authorization.get_user_org_role',
            return_value='owner',
        ):
            result = await require_org_owner(org_id=org_id, user_id=user_id)
            assert result == user_id

    @pytest.mark.asyncio
    async def test_require_org_owner_rejects_admin(self):
        """
        GIVEN: User with admin role
        WHEN: require_org_owner is used
        THEN: 403 Forbidden is raised
        """
        user_id = str(uuid4())
        org_id = uuid4()

        with patch(
            'server.auth.authorization.get_user_org_role',
            return_value='admin',
        ):
            with pytest.raises(HTTPException) as exc_info:
                await require_org_owner(org_id=org_id, user_id=user_id)

            assert exc_info.value.status_code == 403
