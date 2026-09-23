"""Visibility rules for development-only sandbox teams."""
from sqlalchemy import func, or_, select

from models import Team

SANDBOX_TEAM_NAMES = frozenset({
    'severcheckup',
    'servercheckup',
    'checkup',
    'server',
    '서버확인',
})


def normalized_team_name(value):
    return ''.join(value.lower().split()).replace('-', '').replace('_', '').removesuffix('팀')


def is_sandbox_team_name(value):
    normalized = normalized_team_name(value)
    return normalized in SANDBOX_TEAM_NAMES or 'checkup' in normalized


def sandbox_team_ids():
    normalized = func.lower(Team.name)
    for token in (' ', '-', '_'):
        normalized = func.replace(normalized, token, '')
    normalized = func.regexp_replace(normalized, '팀$', '')
    return select(Team.id).where(or_(normalized.in_(SANDBOX_TEAM_NAMES), normalized.like('%checkup%')))


def exclude_sandbox(query, model):
    """Hide sandbox records from the default all-records scope."""
    return query.where(model.team_id.is_(None) | model.team_id.not_in(sandbox_team_ids()))
