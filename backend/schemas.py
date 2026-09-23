import math
from typing import Literal

from pydantic import BaseModel, Field, model_validator


Category = Literal['개발계획', '상권분석', '진행매물']


class GeometryInput(BaseModel):
    type: Literal['Point', 'Polygon']
    coordinates: list

    @model_validator(mode='after')
    def validate_coordinates(self):
        def position(point):
            invalid_number = any(
                isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value)
                for value in point
            ) if isinstance(point, list) else True
            if not isinstance(point, list) or len(point) != 2 or invalid_number:
                raise ValueError('좌표는 [경도, 위도] 형식이어야 합니다.')
            if not -180 <= point[0] <= 180 or not -90 <= point[1] <= 90:
                raise ValueError('좌표 범위를 확인하세요.')

        if self.type == 'Point':
            position(self.coordinates)
        else:
            if not self.coordinates:
                raise ValueError('다각형 좌표가 필요합니다.')
            for ring in self.coordinates:
                if not isinstance(ring, list) or len(ring) < 4 or ring[0] != ring[-1]:
                    raise ValueError('다각형은 닫힌 링과 최소 3개 꼭짓점이 필요합니다.')
                for point in ring:
                    position(point)
        return self


class FeatureInput(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    memo: str = Field(default='', max_length=10000)
    category: Category
    geometry: GeometryInput

    model_config = {'extra': 'forbid'}

    @model_validator(mode='after')
    def trim_name(self):
        self.name = self.name.strip()
        if not self.name:
            raise ValueError('이름을 입력하세요.')
        return self
