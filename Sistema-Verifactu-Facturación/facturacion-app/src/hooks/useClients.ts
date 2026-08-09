'use client';

import { useState, useCallback, useEffect } from 'react';
import { Client } from '@/lib/types';
import * as storage from '@/lib/storage';

export function useClients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    const data = await storage.getClients();
    setClients(data);
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const save = useCallback(async (client: Client) => {
    await storage.saveClient(client);
    await reload();
  }, [reload]);

  const remove = useCallback(async (id: string) => {
    await storage.deleteClient(id);
    await reload();
  }, [reload]);

  const getById = useCallback((id: string) => {
    return clients.find(c => c.id === id);
  }, [clients]);

  const filteredClients = useCallback(() => {
    if (!search) return clients;
    const q = search.toLowerCase();
    return clients.filter(c =>
      c.businessName.toLowerCase().includes(q) ||
      c.tradeName.toLowerCase().includes(q) ||
      c.nif.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      c.city.toLowerCase().includes(q)
    );
  }, [clients, search]);

  const activeClients = useCallback(() => {
    return clients.filter(c => c.active);
  }, [clients]);

  return {
    clients,
    loading,
    search,
    setSearch,
    save,
    remove,
    getById,
    reload,
    filteredClients,
    activeClients,
  };
}
