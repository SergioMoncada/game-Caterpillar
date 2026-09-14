from django.urls import path
from . import views

urlpatterns = [
    path("start-session/", views.start_session, name="start_session"),
    path("submit-result/", views.submit_result, name="submit_result"),
]