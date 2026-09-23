"""Visibility rules for development-only sandbox teams."""
from sqlalchemy import func, select

from models import Team

SANDBOX_TEAM_NAME = 'severcheckup'


def sandbox_team_ids():
    return select(Team.id).where(func.lower(Team.name) == SANDBOX_TEAM_NAME)


def exclude_sandbox(query, model):
    """Hide sandbox records from the default all-records scope."""
    return query.where(model.team_id.is_(None) | model.team_id.not_in(sandbox_team_ids()))
