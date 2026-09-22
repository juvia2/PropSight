from urllib.parse import quote
from fastapi import Depends, HTTPException, Response, UploadFile
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from auth import CurrentUser
from database import get_db
from models import Attachment, User

MAX_BYTES = 10 * 1024 * 1024
MAX_FILES = 20


def image_type(data):
    # Only raster formats can be displayed inline; other files always download.
    if data.startswith(b'\x89PNG\r\n\x1a\n'):
        return 'image/png'
    if data.startswith(b'\xff\xd8\xff'):
        return 'image/jpeg'
    if data[:6] in (b'GIF87a', b'GIF89a'):
        return 'image/gif'
    if data[:4] == b'RIFF' and data[8:12] == b'WEBP':
        return 'image/webp'
    return 'application/octet-stream'


def metadata(db, row):
    author = db.get(User, row.author_id)
    return {'id': row.id, 'filename': row.filename, 'size': row.size,
            'is_image': row.media_type.startswith('image/'),
            'created_at': row.created_at.isoformat(),
            'author_username': author.username, 'author_name': author.display_name}


def register_attachments(app, resource, model):
    def parent(db, item_id, user=None):
        query = select(model).where(model.id == item_id)
        if user:
            query = query.with_for_update()
        record = db.scalar(query)
        if not record:
            raise HTTPException(404, '기록을 찾을 수 없습니다.')
        if user and record.created_by != user.id:
            raise HTTPException(403, '작성자만 첨부파일을 변경할 수 있습니다.')
        return record

    def attachment(db, item_id, attachment_id):
        row = db.scalar(select(Attachment).where(
            Attachment.id == attachment_id, Attachment.resource == resource,
            Attachment.record_id == item_id))
        if not row:
            raise HTTPException(404, '첨부파일을 찾을 수 없습니다.')
        return row

    @app.get(f'/api/{resource}/{{item_id}}/attachments', name=f'{resource}_attachments')
    def list_files(item_id: int, user: CurrentUser, db: Session = Depends(get_db)):
        parent(db, item_id)
        rows = db.scalars(select(Attachment).where(
            Attachment.resource == resource, Attachment.record_id == item_id
        ).order_by(Attachment.id.desc()))
        return [metadata(db, row) for row in rows]

    @app.post(f'/api/{resource}/{{item_id}}/attachments', status_code=201, name=f'{resource}_upload')
    def upload(item_id: int, file: UploadFile, user: CurrentUser, db: Session = Depends(get_db)):
        parent(db, item_id, user)
        count = db.scalar(select(func.count()).select_from(Attachment).where(
            Attachment.resource == resource, Attachment.record_id == item_id))
        if count >= MAX_FILES:
            raise HTTPException(422, '기록당 최대 20개까지 첨부할 수 있습니다.')
        data = file.file.read(MAX_BYTES + 1)
        if len(data) > MAX_BYTES:
            raise HTTPException(413, '파일 하나당 최대 10MB까지 첨부할 수 있습니다.')
        if not data:
            raise HTTPException(422, '빈 파일은 첨부할 수 없습니다.')
        filename = (file.filename or 'attachment').replace('\\', '/').rsplit('/', 1)[-1]
        filename = ''.join(char for char in filename if ord(char) >= 32 and ord(char) != 127).strip()
        if not filename or len(filename) > 255:
            raise HTTPException(422, '파일 이름은 1~255자로 입력해 주세요.')
        row = Attachment(resource=resource, record_id=item_id, filename=filename,
                         media_type=image_type(data), size=len(data), content=data, author_id=user.id)
        db.add(row)
        db.commit()
        db.refresh(row)
        return metadata(db, row)

    @app.get(f'/api/{resource}/{{item_id}}/attachments/{{attachment_id}}', name=f'{resource}_download')
    def download(item_id: int, attachment_id: int, user: CurrentUser, preview: bool = False, db: Session = Depends(get_db)):
        parent(db, item_id)
        row = attachment(db, item_id, attachment_id)
        inline = preview and row.media_type.startswith('image/')
        disposition = 'inline' if inline else 'attachment'
        return Response(row.content, media_type=row.media_type if inline else 'application/octet-stream',
                        headers={'Content-Disposition': disposition + "; filename*=UTF-8''" + quote(row.filename, safe=''),
                                 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store',
                                 'Content-Security-Policy': "default-src 'none'; sandbox"})

    @app.delete(f'/api/{resource}/{{item_id}}/attachments/{{attachment_id}}', status_code=204, name=f'{resource}_delete_attachment')
    def remove(item_id: int, attachment_id: int, user: CurrentUser, db: Session = Depends(get_db)):
        parent(db, item_id, user)
        db.delete(attachment(db, item_id, attachment_id))
        db.commit()
        return Response(status_code=204)
