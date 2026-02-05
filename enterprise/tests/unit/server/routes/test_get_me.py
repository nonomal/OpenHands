"""Tests for GET /api/organizations/{org_id}/me endpoint.

This endpoint returns the current authenticated user's membership record
for the specified organization, including role, status, email, and LLM
override fields (with masked API key).

Why: The frontend useMe() hook calls this endpoint to determine the user's
role in the org, which gates read-only mode on settings pages. Without it,
all role-based access control on settings pages is broken (returns 404).
"""

import uuid
from unittest.mock import MagicMock, patch

import pytest
from fastapi import FastAPI, HTTPException, status
from fastapi.testclient import TestClient
from pydantic import SecretStr

# Mock database before imports
with (
    patch('storage.database.engine', create=True),
    patch('storage.database.a_engine', create=True),
):
    from server.routes.orgs import org_router
    from storage.org_member import OrgMember
    from storage.role import Role
    from storage.user import User

    from openhands.server.user_auth import get_user_id


TEST_USER_ID = str(uuid.uuid4())
TEST_ORG_ID = uuid.uuid4()


@pytest.fixture
def mock_app():
    """Create a test FastAPI app with org routes and mocked auth."""
    app = FastAPI()
    app.include_router(org_router)

    def mock_get_user_id():
        return TEST_USER_ID

    app.dependency_overrides[get_user_id] = mock_get_user_id
    return app


def _make_org_member(
    org_id=None,
    user_id=None,
    role_id=1,
    llm_api_key='sk-test-key-12345',
    llm_model='gpt-4',
    llm_base_url='https://api.example.com',
    max_iterations=50,
    status_val='active',
):
    """Create a mock OrgMember with controlled field values."""
    member = MagicMock(spec=OrgMember)
    member.org_id = org_id or TEST_ORG_ID
    member.user_id = uuid.UUID(user_id) if user_id else uuid.UUID(TEST_USER_ID)
    member.role_id = role_id
    member.llm_api_key = SecretStr(llm_api_key)
    member.llm_api_key_for_byor = None
    member.llm_model = llm_model
    member.llm_base_url = llm_base_url
    member.max_iterations = max_iterations
    member.status = status_val
    return member


def _make_role(role_id=1, name='owner'):
    """Create a mock Role."""
    role = MagicMock(spec=Role)
    role.id = role_id
    role.name = name
    return role


def _make_user(user_id=None, email='test@example.com'):
    """Create a mock User."""
    user = MagicMock(spec=User)
    user.id = uuid.UUID(user_id or TEST_USER_ID)
    user.email = email
    return user


@pytest.mark.asyncio
async def test_get_me_success(mock_app):
    """GIVEN: Authenticated user who is a member of the organization
    WHEN: GET /api/organizations/{org_id}/me is called
    THEN: Returns 200 with the user's membership data including role name and email
    """
    org_member = _make_org_member()
    role = _make_role(role_id=1, name='owner')
    user = _make_user(email='owner@example.com')

    with (
        patch(
            'server.routes.orgs.OrgMemberStore.get_org_member',
            return_value=org_member,
        ),
        patch(
            'server.routes.orgs.RoleStore.get_role_by_id',
            return_value=role,
        ),
        patch(
            'server.routes.orgs.UserStore.get_user_by_id',
            return_value=user,
        ),
    ):
        client = TestClient(mock_app)
        response = client.get(f'/api/organizations/{TEST_ORG_ID}/me')

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data['org_id'] == str(TEST_ORG_ID)
    assert data['user_id'] == TEST_USER_ID
    assert data['email'] == 'owner@example.com'
    assert data['role'] == 'owner'
    assert data['llm_model'] == 'gpt-4'
    assert data['llm_base_url'] == 'https://api.example.com'
    assert data['max_iterations'] == 50
    assert data['status'] == 'active'


@pytest.mark.asyncio
async def test_get_me_masks_llm_api_key(mock_app):
    """GIVEN: User is a member with an LLM API key set
    WHEN: GET /api/organizations/{org_id}/me is called
    THEN: The llm_api_key field is masked (not the raw secret value)

    Why: API keys must never be returned in plaintext in API responses.
    The frontend only needs to know if a key is set, not its value.
    """
    org_member = _make_org_member(llm_api_key='sk-secret-real-key-abcdef')
    role = _make_role(name='member')
    user = _make_user()

    with (
        patch(
            'server.routes.orgs.OrgMemberStore.get_org_member',
            return_value=org_member,
        ),
        patch(
            'server.routes.orgs.RoleStore.get_role_by_id',
            return_value=role,
        ),
        patch(
            'server.routes.orgs.UserStore.get_user_by_id',
            return_value=user,
        ),
    ):
        client = TestClient(mock_app)
        response = client.get(f'/api/organizations/{TEST_ORG_ID}/me')

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    # The raw key must NOT appear in the response
    assert data['llm_api_key'] != 'sk-secret-real-key-abcdef'
    # Should be masked with stars
    assert '**' in data['llm_api_key']


@pytest.mark.asyncio
async def test_get_me_not_a_member(mock_app):
    """GIVEN: Authenticated user who is NOT a member of the organization
    WHEN: GET /api/organizations/{org_id}/me is called
    THEN: Returns 404 (to avoid leaking org existence per spec)
    """
    with patch(
        'server.routes.orgs.OrgMemberStore.get_org_member',
        return_value=None,
    ):
        client = TestClient(mock_app)
        response = client.get(f'/api/organizations/{TEST_ORG_ID}/me')

    assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.asyncio
async def test_get_me_invalid_uuid(mock_app):
    """GIVEN: Invalid UUID format for org_id
    WHEN: GET /api/organizations/{org_id}/me is called
    THEN: Returns 422 (FastAPI validates UUID path parameter)
    """
    client = TestClient(mock_app)
    response = client.get('/api/organizations/not-a-valid-uuid/me')

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


@pytest.mark.asyncio
async def test_get_me_unauthenticated():
    """GIVEN: User is not authenticated
    WHEN: GET /api/organizations/{org_id}/me is called
    THEN: Returns 401
    """
    app = FastAPI()
    app.include_router(org_router)

    async def mock_unauthenticated():
        raise HTTPException(status_code=401, detail='User not authenticated')

    app.dependency_overrides[get_user_id] = mock_unauthenticated

    client = TestClient(app)
    response = client.get(f'/api/organizations/{TEST_ORG_ID}/me')

    assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.asyncio
async def test_get_me_unexpected_error(mock_app):
    """GIVEN: An unexpected error occurs during membership lookup
    WHEN: GET /api/organizations/{org_id}/me is called
    THEN: Returns 500
    """
    with patch(
        'server.routes.orgs.OrgMemberStore.get_org_member',
        side_effect=RuntimeError('Database connection failed'),
    ):
        client = TestClient(mock_app)
        response = client.get(f'/api/organizations/{TEST_ORG_ID}/me')

    assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR


@pytest.mark.asyncio
async def test_get_me_with_null_optional_fields(mock_app):
    """GIVEN: User is a member with null optional fields (llm_model, llm_base_url, etc.)
    WHEN: GET /api/organizations/{org_id}/me is called
    THEN: Returns 200 with null values for optional fields
    """
    org_member = _make_org_member(
        llm_model=None,
        llm_base_url=None,
        max_iterations=None,
        llm_api_key='',
    )
    org_member.llm_api_key_for_byor = None
    role = _make_role(name='member')
    user = _make_user()

    with (
        patch(
            'server.routes.orgs.OrgMemberStore.get_org_member',
            return_value=org_member,
        ),
        patch(
            'server.routes.orgs.RoleStore.get_role_by_id',
            return_value=role,
        ),
        patch(
            'server.routes.orgs.UserStore.get_user_by_id',
            return_value=user,
        ),
    ):
        client = TestClient(mock_app)
        response = client.get(f'/api/organizations/{TEST_ORG_ID}/me')

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data['llm_model'] is None
    assert data['llm_base_url'] is None
    assert data['max_iterations'] is None


@pytest.mark.asyncio
async def test_get_me_with_admin_role(mock_app):
    """GIVEN: User is an admin member of the organization
    WHEN: GET /api/organizations/{org_id}/me is called
    THEN: Returns correct role name 'admin'

    Why: The frontend uses the role to determine if settings are read-only.
    Admins and owners can edit; members see read-only.
    """
    org_member = _make_org_member(role_id=2)
    role = _make_role(role_id=2, name='admin')
    user = _make_user()

    with (
        patch(
            'server.routes.orgs.OrgMemberStore.get_org_member',
            return_value=org_member,
        ),
        patch(
            'server.routes.orgs.RoleStore.get_role_by_id',
            return_value=role,
        ),
        patch(
            'server.routes.orgs.UserStore.get_user_by_id',
            return_value=user,
        ),
    ):
        client = TestClient(mock_app)
        response = client.get(f'/api/organizations/{TEST_ORG_ID}/me')

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data['role'] == 'admin'


@pytest.mark.asyncio
async def test_get_me_masks_byor_api_key(mock_app):
    """GIVEN: User has an llm_api_key_for_byor set
    WHEN: GET /api/organizations/{org_id}/me is called
    THEN: The llm_api_key_for_byor field is also masked
    """
    org_member = _make_org_member()
    org_member.llm_api_key_for_byor = SecretStr('sk-byor-secret-key')
    role = _make_role(name='member')
    user = _make_user()

    with (
        patch(
            'server.routes.orgs.OrgMemberStore.get_org_member',
            return_value=org_member,
        ),
        patch(
            'server.routes.orgs.RoleStore.get_role_by_id',
            return_value=role,
        ),
        patch(
            'server.routes.orgs.UserStore.get_user_by_id',
            return_value=user,
        ),
    ):
        client = TestClient(mock_app)
        response = client.get(f'/api/organizations/{TEST_ORG_ID}/me')

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data['llm_api_key_for_byor'] != 'sk-byor-secret-key'
    assert data['llm_api_key_for_byor'] is None or '**' in data['llm_api_key_for_byor']
