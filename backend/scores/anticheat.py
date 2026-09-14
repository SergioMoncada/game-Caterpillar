from django.utils import timezone

# Ajusta esto según el diseño real del juego (cuántas monedas por segundo es realista)
MAX_COINS_PER_SECOND = 2

def validate_session(session, coins_reported, score_reported):
    elapsed = (timezone.now() - session.started_at).total_seconds()

    if elapsed <= 0:
        return False, "duración inválida"

    max_possible_coins = int(elapsed * MAX_COINS_PER_SECOND)
    if coins_reported > max_possible_coins:
        return False, f"monedas ({coins_reported}) exceden el máximo posible ({max_possible_coins}) para {elapsed:.1f}s"

    if score_reported < coins_reported:
        return False, "score reportado es menor a las monedas (inconsistente)"

    return True, ""