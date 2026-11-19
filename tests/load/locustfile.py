"""
SmartAdvisor NSU — Locust Distributed Load & Seat-Contention Suite
Matches Proposal Slide 17 load scenarios against live SmartAdvisor API (:4000 or NGINX :80).

Usage:
    locust -f tests/load/locustfile.py --host=http://localhost:4000
    locust -f tests/load/locustfile.py --host=http://localhost --headless -u 100 -r 20 -t 60s
"""

import os
import random
from locust import HttpUser, between, task


DEMO_PASSWORD = os.getenv("DEMO_DEFAULT_PASSWORD", "SmartAdvisor2025!")
STUDENT_IDS = ["2412159042", "2321450042", "2211290042"]


class SmartAdvisorStudentUser(HttpUser):
    """Simulates concurrent NSU students checking advising radar, DAG, solver, and cart."""

    wait_time = between(0.1, 0.5)
    weight = 9
    token: str | None = None
    student_id: str = "2412159042"

    def on_start(self) -> None:
        self.student_id = random.choice(STUDENT_IDS)
        with self.client.post(
            "/api/v1/auth/login",
            json={
                "id": self.student_id,
                "password": DEMO_PASSWORD,
                "role": "student",
            },
            name="/api/v1/auth/login [student]",
            catch_response=True,
        ) as resp:
            if resp.status_code == 200:
                self.token = resp.json().get("token")
                resp.success()
            else:
                resp.failure(f"Student login failed ({resp.status_code}): {resp.text}")

    def _auth_headers(self) -> dict[str, str]:
        if not self.token:
            return {}
        return {"Authorization": f"Bearer {self.token}"}

    @task(5)
    def bootstrap_state(self) -> None:
        self.client.get(
            "/api/v1/bootstrap",
            headers=self._auth_headers(),
            name="/api/v1/bootstrap",
        )

    @task(3)
    def check_dag_eligible(self) -> None:
        if not self.token:
            return
        self.client.get(
            "/api/v1/student/dag/eligible",
            headers=self._auth_headers(),
            name="/api/v1/student/dag/eligible",
        )

    @task(2)
    def solve_schedule(self) -> None:
        if not self.token:
            return
        strategy = random.choice(["MilestoneFirst", "MinimizeGaps"])
        self.client.post(
            "/api/v1/student/schedule/solve",
            json={"strategy": strategy, "maxCredits": 15},
            headers=self._auth_headers(),
            name="/api/v1/student/schedule/solve",
        )

    @task(1)
    def health_probe(self) -> None:
        self.client.get("/health", name="/health")

    @task(1)
    def stage_and_unstage_contention(self) -> None:
        if not self.token:
            return
        with self.client.post(
            "/api/v1/student/cart/stage",
            json={"sectionId": "CSE331-01"},
            headers=self._auth_headers(),
            name="/api/v1/student/cart/stage",
            catch_response=True,
        ) as resp:
            if resp.status_code in (200, 409, 422):
                resp.success()
            else:
                resp.failure(f"Unexpected stage status {resp.status_code}")

        with self.client.delete(
            "/api/v1/student/cart/CSE331-01",
            headers=self._auth_headers(),
            name="/api/v1/student/cart/:sectionId",
            catch_response=True,
        ) as resp:
            if resp.status_code in (200, 404):
                resp.success()
            else:
                resp.failure(f"Unexpected unstage status {resp.status_code}")


class SmartAdvisorAdminUser(HttpUser):
    """Simulates IT Operations telemetry polling and RDS4 reconciliation syncs."""

    wait_time = between(0.5, 1.5)
    weight = 1
    token: str | None = None

    def on_start(self) -> None:
        with self.client.post(
            "/api/v1/auth/login",
            json={
                "id": "admin.itops",
                "password": DEMO_PASSWORD,
                "role": "admin",
            },
            name="/api/v1/auth/login [admin]",
            catch_response=True,
        ) as resp:
            if resp.status_code == 200:
                self.token = resp.json().get("token")
                resp.success()
            else:
                resp.failure(f"Admin login failed ({resp.status_code}): {resp.text}")

    @task(3)
    def poll_health(self) -> None:
        self.client.get("/health", name="/health")

    @task(1)
    def trigger_rds4_sync(self) -> None:
        if not self.token:
            return
        self.client.post(
            "/api/v1/admin/rds4/sync",
            json={},
            headers={"Authorization": f"Bearer {self.token}"},
            name="/api/v1/admin/rds4/sync",
        )
