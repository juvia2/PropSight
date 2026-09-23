import json

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from attachments import register_attachments
from auth import CurrentUser
from database import get_db
from models import Attachment, CommercialBlock, MemoRevision, Property, PublicDataSnapshot, Team, User
from public_data import register_public_data
from schemas import Category, FeatureInput
from visibility import exclude_sandbox


router = APIRouter()


def serialize_feature(db, row):
    geometry = db.scalar(select(func.ST_AsGeoJSON(row.geometry)))
    author = db.get(User, row.created_by) if row.created_by else None
    team = db.get(Team, row.team_id) if row.team_id else None
    return {
        'type': 'Feature',
        'id': row.id,
        'geometry': json.loads(geometry),
        'properties': {
            'id': row.id,
            'name': row.name,
            'memo': row.memo,
            'category': row.category,
            'created_at': row.created_at.isoformat() if row.created_at else None,
            'created_by': row.created_by,
            'team_id': row.team_id,
            'author_name': author.display_name if author else '작성자 미지정',
            'author_username': author.username if author else None,
            'team_name': team.name if team else '팀 미지정',
        },
    }


def register_record_routes(resource, model, geometry_type):
    register_attachments(router, resource, model)
    register_public_data(router, resource, model)

    def get_row(db, item_id):
        row = db.get(model, item_id)
        if row is None:
            raise HTTPException(404, '데이터를 찾을 수 없습니다.')
        return row

    def assign(db, row, payload, user):
        if payload.geometry.type != geometry_type:
            raise HTTPException(422, f'{geometry_type} geometry가 필요합니다.')
        geometry = func.ST_SetSRID(func.ST_GeomFromGeoJSON(json.dumps(payload.geometry.model_dump())), 4326)
        if not db.scalar(select(func.ST_IsValid(geometry))):
            raise HTTPException(422, '교차하지 않는 유효한 다각형을 그려주세요.')
        row.name, row.memo, row.category = payload.name, payload.memo, payload.category
        row.geometry = geometry
        db.add(row)
        db.flush()
        db.add(MemoRevision(resource=resource, record_id=row.id, memo=payload.memo, author_id=user.id))
        db.commit()
        db.refresh(row)
        return serialize_feature(db, row)

    @router.get(f'/api/{resource}', name=f'list_{resource}')
    def list_items(user: CurrentUser, category: Category | None = None, team_id: int | None = None, created_by: int | None = None, db: Session = Depends(get_db)):
        query = select(model).order_by(model.id.desc())
        if category:
            query = query.where(model.category == category)
        if team_id is not None:
            query = query.where(model.team_id == team_id)
        else:
            query = exclude_sandbox(query, model)
        if created_by is not None:
            query = query.where(model.created_by == created_by)
        return {'type': 'FeatureCollection', 'features': [serialize_feature(db, row) for row in db.scalars(query)]}

    @router.get(f'/api/{resource}/{{item_id}}', name=f'get_{resource}')
    def get_item(item_id: int, user: CurrentUser, db: Session = Depends(get_db)):
        return serialize_feature(db, get_row(db, item_id))

    @router.get(f'/api/{resource}/{{item_id}}/revisions', name=f'list_{resource}_revisions')
    def list_revisions(item_id: int, user: CurrentUser, db: Session = Depends(get_db)):
        get_row(db, item_id)
        revisions = db.scalars(select(MemoRevision).where(
            MemoRevision.resource == resource, MemoRevision.record_id == item_id
        ).order_by(MemoRevision.id.desc())).all()
        author_ids = {revision.author_id for revision in revisions}
        authors = {person.id: person for person in db.scalars(select(User).where(User.id.in_(author_ids)))} if author_ids else {}
        return [{
            'id': revision.id,
            'memo': revision.memo,
            'saved_at': revision.saved_at.isoformat(),
            'author_id': revision.author_id,
            'author_username': authors[revision.author_id].username,
            'author_name': authors[revision.author_id].display_name,
        } for revision in revisions]

    @router.post(f'/api/{resource}', status_code=201, name=f'create_{resource}')
    def create_item(payload: FeatureInput, user: CurrentUser, db: Session = Depends(get_db)):
        return assign(db, model(created_by=user.id, team_id=user.team_id), payload, user)

    @router.put(f'/api/{resource}/{{item_id}}', name=f'update_{resource}')
    def update_item(item_id: int, payload: FeatureInput, user: CurrentUser, db: Session = Depends(get_db)):
        row = get_row(db, item_id)
        if row.created_by != user.id:
            raise HTTPException(403, '작성자만 수정할 수 있습니다.')
        return assign(db, row, payload, user)

    @router.delete(f'/api/{resource}/{{item_id}}', status_code=204, name=f'delete_{resource}')
    def delete_item(item_id: int, user: CurrentUser, db: Session = Depends(get_db)):
        row = db.scalar(select(model).where(model.id == item_id).with_for_update())
        if row is None:
            raise HTTPException(404, '데이터를 찾을 수 없습니다.')
        if row.created_by != user.id:
            raise HTTPException(403, '작성자만 삭제할 수 있습니다.')
        db.execute(delete(MemoRevision).where(MemoRevision.resource == resource, MemoRevision.record_id == item_id))
        db.execute(delete(PublicDataSnapshot).where(PublicDataSnapshot.resource == resource, PublicDataSnapshot.record_id == item_id))
        db.execute(delete(Attachment).where(Attachment.resource == resource, Attachment.record_id == item_id))
        db.delete(row)
        db.commit()
        return Response(status_code=204)


register_record_routes('properties', Property, 'Point')
register_record_routes('commercial_blocks', CommercialBlock, 'Polygon')
