from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response
from .models import Player, GameSession
from .anticheat import validate_session

@api_view(["POST"])
def start_session(request):
    email = request.data.get("email")
    player, _ = Player.objects.get_or_create(email=email)
    session = GameSession.objects.create(player=player)
    return Response({
        "session_id": session.id,
        "started_at": session.started_at,
        "best_score": player.best_score,   # <-- nuevo individualiza los scores
    })

@api_view(["POST"])
def submit_result(request):
    session = GameSession.objects.get(id=request.data.get("session_id"))
    coins = int(request.data.get("coins", 0))
    score = int(request.data.get("score", 0))

    is_valid, reason = validate_session(session, coins, score)

    session.ended_at = timezone.now()   # <-- corregido
    session.coins_reported = coins
    session.score_reported = score
    session.is_valid = is_valid
    session.rejection_reason = reason
    session.save()

    if is_valid:
     # Antes: session.player.total_coins += coins  (esto sumaba, no reemplazaba)
        session.player.total_coins = max(session.player.total_coins, coins)
        session.player.best_score = max(session.player.best_score, score)
        session.player.save()
        return Response({"status": "ok", "total_coins": session.player.total_coins})

    return Response({"status": "rejected", "reason": reason}, status=400)   