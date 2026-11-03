# Installer le cockpit

Tout se fait dans un navigateur sur ton PC. Compte environ une heure la première fois.
Règle : les clés vont uniquement dans les secrets GitHub. Ne les envoie à personne, pas même à Claude.

## 1. Déposer les fichiers dans Drive
1. Dézippe `cockpit-drive.zip`.
2. Ouvre le dossier **Cockpit** de ton Google Drive (`plan.json` y est déjà).
3. Glisse-y les 10 fichiers dézippés.

## 2. Mettre le code sur GitHub
1. Sur github.com, crée un dépôt **public** nommé `cockpit`, sans README.
2. Dézippe `cockpit-app.zip`. Dans le dépôt : **uploading an existing file**, puis glisse tout le contenu du dossier, y compris `.github`.
3. Clique sur **Commit changes**.
4. Dans **Settings > Pages**, choisis **GitHub Actions** comme source.

## 3. Créer l'accès Google
Sur console.cloud.google.com :
1. Crée un projet nommé `Cockpit`.
2. Dans **API et services > Bibliothèque**, active **Google Drive API**.
3. Dans **IAM et administration > Comptes de service**, crée un compte `cockpit-script`, sans rôle.
4. Ouvre ce compte, onglet **Clés** : **Ajouter une clé > JSON**. Un fichier se télécharge : garde-le secret.
5. Copie l'adresse du compte (elle finit par `gserviceaccount.com`). Dans Drive, partage le dossier **Cockpit** avec elle, en **Éditeur**.
6. Dans **Google Auth Platform** (écran de consentement) : audience **Externe**, statut **Test**, et ajoute ton adresse Gmail comme utilisateur test.
7. Dans **Accès aux données**, ajoute le niveau d'accès `https://www.googleapis.com/auth/drive`.
8. Dans **Clients**, crée un client **Application Web**. Dans **Origines JavaScript autorisées**, mets `https://TON-PSEUDO.github.io`.
9. Copie l'**ID client**. Sur GitHub, ouvre `app/config.js`, clique sur le crayon, remplace `A_REMPLACER.apps.googleusercontent.com`, puis enregistre.

## 4. Donner les clés au script
Sur GitHub : **Settings > Secrets and variables > Actions > New repository secret**. Crée ces quatre secrets :
- `IV_KEY` : ta clé API intervals.icu.
- `IV_ATHLETE` : ton identifiant intervals.icu, de la forme `i123456`.
- `DRIVE_FOLDER_ID` : la fin de l'adresse du dossier Cockpit dans Drive.
- `GOOGLE_SA_JSON` : tout le contenu du fichier JSON de l'étape 3.4.

Tu peux ensuite supprimer le fichier JSON de ton PC.

## 5. Premier essai
1. Onglet **Actions > Script du soir > Run workflow**.
2. Attends la coche verte. En cas de croix rouge, envoie à Claude une capture du message d'erreur, en vérifiant qu'aucune clé n'y apparaît.
3. Dans Drive, `data.json` doit porter la date du jour.

## 6. Installer l'appli
L'adresse est `https://TON-PSEUDO.github.io/cockpit/`.
- **PC Windows :** ouvre-la dans Chrome ou Edge, connecte-toi, puis clique sur l'icône d'installation dans la barre d'adresse.
- **Android :** ouvre-la dans Chrome, connecte-toi, puis menu ⋮ > **Installer l'application** (ou **Ajouter à l'écran d'accueil**).

Google affichera un avertissement d'appli non vérifiée : c'est normal, c'est ton appli. Clique sur **Paramètres avancés**, puis continue.

## Usage quotidien
- L'appli s'ouvre tout de suite avec la dernière copie. Si elle date de plus de 20 heures, touche **Actualiser depuis Drive**.
- Les nouvelles saisies de poids et de tension se font dans l'appli.
- Hors ligne, une saisie reste sur l'appareil. Touche le bandeau au retour du réseau pour l'envoyer.

## Le jour de la bascule (pas avant)
Pendant la phase en parallèle, le script n'envoie rien sur la montre : c'est la tâche Claude actuelle qui s'en charge.
Le jour de la bascule : dans **Settings > Secrets and variables > Actions > Variables**, crée `ENVOI_MONTRE` avec la valeur `oui`, et demande à Claude de réduire sa tâche au coach.
