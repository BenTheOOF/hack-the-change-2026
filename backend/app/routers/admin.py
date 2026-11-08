"""Account management for admins: roles, admins, and patient assignments.

Each call goes to an admin-only database function with the admin's own token, so the database
enforces the admin check. Admins get no extra access to other patients' clinical records.
"""

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, model_validator

from app.routers.physio import Care, Context

router = APIRouter(prefix="/admin", tags=["admin"])


class RoleInput(BaseModel):
    role: Literal["patient", "therapist"]


class AdminInput(BaseModel):
    is_admin: bool


class AssignmentInput(BaseModel):
    therapist_id: UUID
    patient_id: UUID

    @model_validator(mode="after")
    def different_people(self) -> "AssignmentInput":
        if self.therapist_id == self.patient_id:
            raise ValueError("A therapist cannot be assigned to themselves.")
        return self


async def require_admin(ctx: Care) -> dict:
    profile = await ctx.profile()
    if not profile.get("is_admin"):
        raise HTTPException(403, "This action requires an admin account.")
    return profile


@router.get("/accounts")
async def accounts(ctx: Context) -> dict:
    await require_admin(ctx)
    return {
        "accounts": await ctx.call("POST", "/rest/v1/rpc/admin_list_accounts", {}),
        "assignments": await ctx.call("POST", "/rest/v1/rpc/admin_list_assignments", {}),
    }


@router.post("/accounts/{user_id}/role")
async def set_role(user_id: UUID, data: RoleInput, ctx: Context) -> object:
    await require_admin(ctx)
    return await ctx.call("POST", "/rest/v1/rpc/admin_set_role", {"p_user": str(user_id), "p_role": data.role})


@router.post("/accounts/{user_id}/admin")
async def set_admin(user_id: UUID, data: AdminInput, ctx: Context) -> object:
    await require_admin(ctx)
    return await ctx.call("POST", "/rest/v1/rpc/admin_set_admin", {"p_user": str(user_id), "p_value": data.is_admin})


@router.post("/assignments", status_code=201)
async def assign(data: AssignmentInput, ctx: Context) -> dict:
    await require_admin(ctx)
    await ctx.call("POST", "/rest/v1/rpc/admin_assign",
                   {"p_therapist": str(data.therapist_id), "p_patient": str(data.patient_id)})
    return {"assigned": True}


@router.delete("/assignments/{therapist_id}/{patient_id}")
async def unassign(therapist_id: UUID, patient_id: UUID, ctx: Context) -> dict:
    await require_admin(ctx)
    await ctx.call("POST", "/rest/v1/rpc/admin_unassign", {"p_therapist": str(therapist_id), "p_patient": str(patient_id)})
    return {"unassigned": True}
