""""""
"""
=========================================================
* UF BRAVO Platform
=========================================================

* Copyright 2025 by Jackson Cagle, Fixel Institute
* The source code is made available under Open Source GPL-3.0 License

 =========================================================

* The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
"""
"""
Therapy Related API Module
===================================================
@author: Jackson Cagle, University of Florida
@email: jackson.cagle@neurology.ufl.edu
"""

import rest_framework.views as RestViews
import rest_framework.parsers as RestParsers
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response

import os
import json
import traceback
from copy import deepcopy
from pathlib import Path
import hmac, hashlib

from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect, csrf_exempt
from django.conf import settings

from Server import models
from modules.HelperFunctions import sanitize_input, get_or_none
from modules import Database, DataCurator, Therapy

DATABASE_PATH = os.environ.get('DATASERVER_PATH')
HASH_KEY = os.environ.get('DATASERVER_HASHKEY')

class QueryTherapyHistory(RestViews.APIView):

    parser_classes = [RestParsers.JSONParser]
    permission_classes = [IsAuthenticated]

    @method_decorator(csrf_protect if not settings.DEBUG else csrf_exempt)
    def post(self, request):
        if not get_or_none(sanitize_input)(request.data, required_keys=["ParticipantId"]):
            return Response(status=400, data={"message": "Malformed Input"})
        
        Permissions = Database.checkAccessPermission(request.user, request.data["ParticipantId"], 
                                study_uid=request.user.configuration["ActiveStudy"] if "ActiveStudy" in request.user.configuration.keys() else None)
        if not Permissions:
            return Response(status=403)
        
        """
        result = Database.getCachedResult("/queryTherapyHistory", request.data["ParticipantId"], {**request.data})
        if result:
            return Response(status=200, data=result)
        """
        Participant = models.Participant.find(uid=request.data["ParticipantId"])
        TherapyHistory = Therapy.queryTherapyHistory(Participant)
        TherapyHistory["TherapyTimeline"] = Therapy.createTherapyTimeline(TherapyHistory)
        TherapyHistory["DeviceImpedance"] = Therapy.queryElectrodeImpedances(Participant)

        Database.saveCachedResult(TherapyHistory, "/queryTherapyHistory", request.data["ParticipantId"], {**request.data})
        return Response(status=200, data=TherapyHistory)
