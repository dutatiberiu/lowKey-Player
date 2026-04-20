#!/usr/bin/env python3
"""
R2 Bucket Scanner - Generează automat playlist.json din structura R2
"""

import boto3
import json
from collections import defaultdict
import os

# R2 Credentials
ACCESS_KEY_ID = "7210830f39639a520ec5478743c5a603"
SECRET_ACCESS_KEY = "ae2a6fd16f26e3f822e2f4f2ae25edba990c10dafd96a6e45e50d399d2e3b3a5"
ACCOUNT_ID = "d7fae86cb5a116b744a34198f4f6f8f9"
BUCKET_NAME = "undercover-music"

# R2 Endpoint
ENDPOINT_URL = f"https://{ACCOUNT_ID}.r2.cloudflarestorage.com"
PUBLIC_URL = "https://pub-2c614bd24cca4ed6948f5bf497b0cfe1.r2.dev"

def scan_r2_bucket():
    """Scanează bucket-ul R2 și returnează structura"""

    print(f">> Conectare la R2 bucket: {BUCKET_NAME}")
    print(f">> Endpoint: {ENDPOINT_URL}\n")

    # Creează client S3 (R2 e compatibil S3)
    s3_client = boto3.client(
        's3',
        endpoint_url=ENDPOINT_URL,
        aws_access_key_id=ACCESS_KEY_ID,
        aws_secret_access_key=SECRET_ACCESS_KEY,
        region_name='auto'
    )

    try:
        # Listează toate obiectele din bucket
        response = s3_client.list_objects_v2(Bucket=BUCKET_NAME)

        if 'Contents' not in response:
            print("[!] Bucket-ul e gol sau nu exista!")
            return []

        files = []
        for obj in response['Contents']:
            key = obj['Key']
            size = obj['Size']
            files.append({
                'path': key,
                'size': size
            })

        print(f"[OK] Gasite {len(files)} fisiere in bucket!\n")
        return files

    except Exception as e:
        print(f"[ERROR] Eroare la scanare: {e}")
        return []

def organize_files(files):
    """Organizează fișierele pe structura User → Artist → Album"""

    structure = defaultdict(lambda: defaultdict(lambda: defaultdict(list)))

    audio_extensions = ['.mp3', '.MP3', '.flac', '.FLAC', '.m4a', '.wav']

    for file_info in files:
        path = file_info['path']

        # Verifică dacă e fișier audio
        if not any(path.endswith(ext) for ext in audio_extensions):
            continue

        # Split path: User/Artist/Album/song.mp3
        parts = path.split('/')

        if len(parts) < 2:
            # Fișier în root - skip
            continue

        user = parts[0]

        if len(parts) == 2:
            # User/song.mp3 - Singles
            artist = "Singles"
            album = "Singles"
            filename = parts[1]
        elif len(parts) == 3:
            # User/FolderName/song.mp3
            folder_name = parts[1]
            filename = parts[2]

            # Check if folder is "Artist - Album" format
            if ' - ' in folder_name:
                # Split on first " - " to get Artist and Album
                split_parts = folder_name.split(' - ', 1)
                artist = split_parts[0].strip()
                album = split_parts[1].strip() if len(split_parts) > 1 else folder_name
            else:
                # Folder is just artist name, files are singles or mixed
                artist = folder_name
                album = folder_name  # Album = Artist name
        else:
            # User/Artist/Album/song.mp3
            artist = parts[1]
            album = parts[2]
            filename = parts[3]

        structure[user][artist][album].append({
            'filename': filename,
            'path': path
        })

    return structure

def generate_playlist_json(structure):
    """Generează playlist.json din structura organizată"""

    playlist = {
        "baseUrl": PUBLIC_URL,
        "users": []
    }

    for user_name, artists in sorted(structure.items()):
        user_data = {
            "name": user_name,
            "id": user_name.lower().replace(' ', '-'),
            "artists": []
        }

        for artist_name, albums in sorted(artists.items()):
            artist_data = {
                "name": artist_name,
                "id": f"{user_data['id']}-{artist_name.lower().replace(' ', '-')}",
                "albums": []
            }

            for album_name, songs in sorted(albums.items()):
                # Sort songs by filename
                sorted_songs = sorted(songs, key=lambda x: x['filename'])

                # Extract real path from first song (remove filename)
                first_song_path = sorted_songs[0]['path']
                # Get directory path (everything except the filename)
                real_path = '/'.join(first_song_path.split('/')[:-1])

                album_data = {
                    "name": album_name,
                    "id": f"{artist_data['id']}-{album_name.lower().replace(' ', '-')}",
                    "path": real_path,
                    "songs": [song['filename'] for song in sorted_songs]
                }

                artist_data['albums'].append(album_data)

            user_data['artists'].append(artist_data)

        playlist['users'].append(user_data)

    return playlist

def print_structure(structure):
    """Afișează structura găsită"""

    print("\n" + "="*60)
    print("STRUCTURA GASITA:")
    print("="*60 + "\n")

    total_songs = 0

    for user_name, artists in sorted(structure.items()):
        print(f"[USER] {user_name}")

        for artist_name, albums in sorted(artists.items()):
            print(f"  [ARTIST] {artist_name}")

            for album_name, songs in sorted(albums.items()):
                song_count = len(songs)
                total_songs += song_count
                print(f"    [ALBUM] {album_name} ({song_count} melodii)")

        print()

    print(f"TOTAL: {total_songs} melodii gasite!")
    print("="*60 + "\n")

def main():
    """Funcția principală"""

    print("\n" + "="*60)
    print("  R2 BUCKET SCANNER - Jail Music Project")
    print("="*60 + "\n")

    # 1. Scanează bucket-ul
    files = scan_r2_bucket()

    if not files:
        print("[!] Nu s-au gasit fisiere!")
        return

    # 2. Organizează fișierele
    print(">> Organizare fisiere pe User -> Artist -> Album...\n")
    structure = organize_files(files)

    # 3. Afișează structura
    print_structure(structure)

    # 4. Generează playlist.json
    print(">> Generare playlist.json...")
    playlist_data = generate_playlist_json(structure)

    # 5. Salvează playlist.json
    output_file = "playlist.json"
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(playlist_data, f, indent=2, ensure_ascii=False)

    print(f"[OK] Playlist generat cu succes: {output_file}")
    print("\n>> Gata! Sincronizare completă!\n")

if __name__ == "__main__":
    main()
