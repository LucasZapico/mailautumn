/**
 * IPC handlers for CRM plugin operations.
 */

import { ipcMain } from 'electron';
import * as crm from './crm-db';

export function registerCrmHandlers(): void {
  ipcMain.handle('crm:get-contact', (_event, email: string) => {
    return crm.getContact(email);
  });

  ipcMain.handle('crm:upsert-contact', (_event, contact: Partial<crm.CrmContact> & { email: string }) => {
    return crm.upsertContact(contact);
  });

  ipcMain.handle('crm:delete-contact', (_event, email: string) => {
    crm.deleteContact(email);
    return { success: true };
  });

  ipcMain.handle('crm:search-contacts', (_event, query: string, limit?: number) => {
    return crm.searchContacts(query, limit);
  });

  ipcMain.handle('crm:all-contacts', (_event, limit?: number) => {
    return crm.getAllContacts(limit);
  });

  ipcMain.handle('crm:contacts-by-tag', (_event, tag: string, limit?: number) => {
    return crm.getContactsByTag(tag, limit);
  });

  ipcMain.handle('crm:tags', () => {
    return crm.getTags();
  });

  ipcMain.handle('crm:rename-tag', (_event, oldName: string, newName: string) => {
    const changed = crm.renameTag(oldName, newName);
    return { success: true, changed };
  });

  ipcMain.handle('crm:delete-tag', (_event, name: string) => {
    const changed = crm.deleteTag(name);
    return { success: true, changed };
  });

  ipcMain.handle('crm:add-interaction', (_event, contactEmail: string, threadId: string, subject: string, direction: 'sent' | 'received', date: string) => {
    crm.addInteraction(contactEmail, threadId, subject, direction, date);
    return { success: true };
  });

  ipcMain.handle('crm:get-interactions', (_event, contactEmail: string, limit?: number) => {
    return crm.getInteractions(contactEmail, limit);
  });

  ipcMain.handle('crm:contacts-for-thread', (_event, threadId: string) => {
    return crm.getContactsForThread(threadId);
  });
}
