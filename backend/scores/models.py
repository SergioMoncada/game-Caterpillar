from django.db import models

class Player(models.Model):
    email = models.EmailField(unique=True)
    total_coins = models.PositiveIntegerField(default=0)
    best_score = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

class GameSession(models.Model):
    """Se crea CUANDO el jugador da click en 'Jugar', no al terminar."""
    player = models.ForeignKey(Player, on_delete=models.CASCADE, related_name="sessions")
    started_at = models.DateTimeField(auto_now_add=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    coins_reported = models.PositiveIntegerField(default=0)
    score_reported = models.PositiveIntegerField(default=0)
    is_valid = models.BooleanField(default=True)
    rejection_reason = models.CharField(max_length=255, blank=True)