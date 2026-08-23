"""Authentication integration tests for the AI Healthcare Intelligence backend.

These tests exercise the real login flow (token issuance, role resolution,
inactive-account handling, and RBAC-protected routes) using the application's
FastAPI TestClient with an isolated in-memory database.
"""
import pytest
from fastapi.testclient import TestClient

from backend import auth, database, models


def _create_user(db, username, password, role="patient", email=None, is_active=1):
    user = models.User(
        username=username,
        hashed_password=auth.get_password_hash(password),
        email=email or f"{username}@example.com",
        role=role,
        is_active=is_active,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _login(client, username, password):
    return client.post(
        "/v1/token",
        data={"username": username, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )


def test_admin_login_succeeds_and_resolves_role(client, db_session):
    _create_user(
        db_session, "admin1", "Str0ngP@ss1", role="admin", email="admin1@clinos.com"
    )
    resp = _login(client, "admin1@clinos.com", "Str0ngP@ss1")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]

    profile = client.get(
        "/v1/profile", headers={"Authorization": f"Bearer {body['access_token']}"}
    )
    assert profile.status_code == 200
    assert profile.json()["role"] == "admin"


def test_email_and_username_both_accepted(client, db_session):
    _create_user(db_session, "doc1", "Str0ngP@ss1", role="doctor", email="doc1@clinos.com")
    by_email = _login(client, "doc1@clinos.com", "Str0ngP@ss1")
    by_user = _login(client, "doc1", "Str0ngP@ss1")
    assert by_email.status_code == 200
    assert by_user.status_code == 200


def test_invalid_password_returns_401(client, db_session):
    _create_user(db_session, "user1", "Str0ngP@ss1", role="patient")
    resp = _login(client, "user1", "wrong-password")
    assert resp.status_code == 401
    assert "Incorrect username or password" in resp.json()["detail"]


def test_unknown_user_returns_401(client, db_session):
    resp = _login(client, "ghost@nowhere.com", "whatever")
    assert resp.status_code == 401
    assert "Incorrect username or password" in resp.json()["detail"]


def test_inactive_user_returns_403(client, db_session):
    _create_user(db_session, "inactive1", "Str0ngP@ss1", role="patient", is_active=0)
    resp = _login(client, "inactive1", "Str0ngP@ss1")
    assert resp.status_code == 403
    assert "inactive" in resp.json()["detail"].lower()


def test_protected_route_requires_token(client, db_session):
    _create_user(db_session, "user2", "Str0ngP@ss1", role="patient")
    no_token = client.get("/v1/users")
    assert no_token.status_code == 401

    token = _login(client, "user2", "Str0ngP@ss1").json()["access_token"]
    with_token = client.get(
        "/v1/users", headers={"Authorization": f"Bearer {token}"}
    )
    # Non-admin gets 403 (RBAC enforced), proving role checks run.
    assert with_token.status_code == 403


def test_admin_rbac_allows_user_list(client, db_session):
    _create_user(db_session, "admin2", "Str0ngP@ss1", role="admin", email="admin2@clinos.com")
    token = _login(client, "admin2@clinos.com", "Str0ngP@ss1").json()["access_token"]
    resp = client.get("/v1/users", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)
