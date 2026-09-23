export const CATEGORIES = ['개발계획', '상권분석', '진행매물']
export const COLORS = { 개발계획: '#7970cb', 상권분석: '#168b80', 진행매물: '#d38b36' }
export const HAS_MAP_KEY = Boolean(import.meta.env.VITE_KAKAO_APP_KEY && import.meta.env.VITE_KAKAO_APP_KEY !== 'YOUR_KAKAO_APP_KEY')
export const SANDBOX_TEAM_NAME = 'severcheckup'

export const formatCreatedAt = value => value
  ? new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value))
  : '날짜 미기록'
