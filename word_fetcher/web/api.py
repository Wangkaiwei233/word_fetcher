from fastapi import APIRouter

from word_fetcher.web.routes.dict import router as dict_router
from word_fetcher.web.routes.jobs import router as jobs_router
from word_fetcher.web.routes.upload import router as upload_router

api_router = APIRouter()
api_router.include_router(upload_router)
api_router.include_router(jobs_router)
api_router.include_router(dict_router)


