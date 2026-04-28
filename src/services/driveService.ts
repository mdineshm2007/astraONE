import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';

export function createOAuth2Client() {
  const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
  const REDIRECT_URI = 'http://localhost:3001/api/auth/google/callback';
  return new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
}

export async function findFolderByName(auth: any, name: string, parentId?: string) {
  const drive = google.drive({ version: 'v3', auth });
  try {
    const q = `name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false${parentId ? ` and '${parentId}' in parents` : ''}`;
    const response = await drive.files.list({
      q,
      fields: 'files(id, name, webViewLink)',
      spaces: 'drive'
    });
    return response.data.files && response.data.files.length > 0 ? response.data.files[0] : null;
  } catch (error: any) {
    console.error(`Error finding folder ${name}:`, error.message);
    return null;
  }
}

export async function createFolder(auth: any, name: string, parentId?: string) {
  const drive = google.drive({ version: 'v3', auth });
  try {
    const fileMetadata = {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentId ? [parentId] : []
    };
    const file = await drive.files.create({
      requestBody: fileMetadata as any,
      fields: 'id, name, webViewLink'
    });
    console.log(`Created folder: ${name} (${file.data.id})`);
    return file.data;
  } catch (error: any) {
    console.error(`Error creating folder ${name}:`, error.response?.data || error.message);
    throw error;
  }
}

export async function getOrCreateFolder(auth: any, name: string, parentId?: string) {
  const existing = await findFolderByName(auth, name, parentId);
  if (existing) {
    console.log(`Found existing folder: ${name} (${existing.id})`);
    return existing;
  }
  return await createFolder(auth, name, parentId);
}

export async function uploadFile(auth: any, fileName: string, mimeType: string, stream: any, parentId: string) {
  const drive = google.drive({ version: 'v3', auth });
  const fileMetadata = {
    name: fileName,
    parents: [parentId]
  };
  const media = {
    mimeType,
    body: stream
  };
  const file = await drive.files.create({
    requestBody: fileMetadata as any,
    media: media,
    fields: 'id, webViewLink'
  });
  return file.data;
}

export async function getFolderList(auth: any, parentId: string) {
  const drive = google.drive({ version: 'v3', auth });
  const response = await drive.files.list({
    q: `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name, webViewLink)'
  });
  return response.data.files;
}
