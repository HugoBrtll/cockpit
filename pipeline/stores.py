"""Lecture et écriture des fichiers du dossier Cockpit.

DriveStore : Google Drive, avec un compte de service partagé sur le seul dossier Cockpit.
Un compte de service n'a pas d'espace de stockage : il ne crée pas de fichiers, il remplace le contenu
de fichiers existants, déposés une fois pour toutes dans le dossier (voir GUIDE.md).
LocalStore : un dossier local, pour les essais.
"""
import json
import os

API = "https://www.googleapis.com/drive/v3/files"
UPLOAD = "https://www.googleapis.com/upload/drive/v3/files"


class LocalStore:
    def __init__(self, folder):
        self.folder = folder

    def get(self, name):
        p = os.path.join(self.folder, name)
        return open(p, "rb").read() if os.path.exists(p) else None

    def put(self, name, data):
        with open(os.path.join(self.folder, name), "wb") as f:
            f.write(data)


class DriveStore:
    def __init__(self, folder_id, sa_json):
        from google.auth.transport.requests import AuthorizedSession
        from google.oauth2 import service_account
        cred = service_account.Credentials.from_service_account_info(
            json.loads(sa_json), scopes=["https://www.googleapis.com/auth/drive"])
        self.http = AuthorizedSession(cred)
        self.folder = folder_id

    def _find(self, name):
        safe = name.replace("\\", "\\\\").replace("'", "\\'")
        q = f"'{self.folder}' in parents and name = '{safe}' and trashed = false"
        r = self.http.get(API, params={"q": q, "orderBy": "modifiedTime desc", "pageSize": 5,
                                       "fields": "files(id,name,modifiedTime)"}, timeout=60)
        r.raise_for_status()
        files = r.json().get("files", [])
        return files[0]["id"] if files else None

    def get(self, name):
        fid = self._find(name)
        if not fid:
            return None
        r = self.http.get(f"{API}/{fid}", params={"alt": "media"}, timeout=120)
        r.raise_for_status()
        return r.content

    def put(self, name, data):
        fid = self._find(name)
        if not fid:
            raise SystemExit(f"{name} est absent du dossier Cockpit : dépose-le une fois dans Drive (voir GUIDE.md).")
        r = self.http.patch(f"{UPLOAD}/{fid}", params={"uploadType": "media"}, data=data,
                            headers={"Content-Type": "application/json"}, timeout=300)
        r.raise_for_status()


def open_store(local=None):
    if local:
        return LocalStore(local)
    return DriveStore(os.environ["DRIVE_FOLDER_ID"], os.environ["GOOGLE_SA_JSON"])
