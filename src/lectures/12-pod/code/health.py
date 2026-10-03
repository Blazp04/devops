# klopa/health.py – odgovori na provjere kubeleta (urls.py: /healthz i /ready)
import queue
import threading

from django.db import DatabaseError, transaction
from django.http import HttpResponse, JsonResponse

from .models import Order

# Danas klopa-api puni predmemoriju prije nego što gunicorn počne odgovarati (zato provjera
# pokretanja). Kad se bude punila u pozadini, /ready će dotad vraćati 503.
warm = threading.Event()  # postavi se kad se predmemorija jelovnika napuni
local_jobs: queue.Queue = queue.Queue()  # poslovi koje ovaj Pod još mora obraditi


def healthz(request):
    """Provjera živosti: odgovara li ovaj proces? Bez baze, Redisa i ičega izvana."""
    return HttpResponse("ok")


def ready(request):
    """Provjera spremnosti: može li OVAJ Pod upravo sada služiti?"""
    if not warm.is_set():
        return JsonResponse({"ready": False, "reason": "punim predmemoriju"}, status=503)
    if local_jobs.qsize() > 100:  # vlastito stanje: preopterećen, neka promet ide drugima
        return JsonResponse({"ready": False, "reason": "preopterećen"}, status=503)
    return HttpResponse("ready")  # baza se ovdje namjerno NE provjerava


def create_order(request):
    """Prava narudžba: kad baza ne radi, brzo i jasno 503 – a Pod ostaje Ready."""
    # settings.py: DATABASES["default"]["OPTIONS"] = {"connect_timeout": 2},
    # inače „brzi” 503 može čekati desetke sekundi
    try:
        with transaction.atomic():
            order = Order.objects.create(student_id=request.user.id, meal_id=request.POST["meal"])
    except DatabaseError:
        response = JsonResponse({"error": "baza trenutačno nije dostupna, probajte za koju sekundu"}, status=503)
        response["Retry-After"] = "5"
        return response
    return JsonResponse({"id": order.id}, status=201)
