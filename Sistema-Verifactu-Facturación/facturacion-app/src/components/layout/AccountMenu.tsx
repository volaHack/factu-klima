'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { User, Settings, LogOut, ChevronDown, Save, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { getUserProfile, saveUserProfile } from '@/lib/storage';
import { UserProfile } from '@/lib/types';

function initialsFrom(name: string, email: string): string {
  const source = name.trim() || email.trim();
  if (!source) return '?';
  const parts = source.split(/[\s@.]+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export default function AccountMenu() {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [email, setEmail] = useState('');
  const [nameDraft, setNameDraft] = useState('');
  const [avatarDraft, setAvatarDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const [p, { data }] = await Promise.all([
        getUserProfile(),
        createClient().auth.getUser(),
      ]);
      setProfile(p);
      setEmail(data?.user?.email || '');
      setNameDraft(p?.displayName || '');
      setAvatarDraft(p?.avatarUrl || '');
    })();
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
        setEditing(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); setEditing(false); }
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const displayName = profile?.displayName || '';
  const initials = initialsFrom(displayName, email);

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      await saveUserProfile({
        displayName: nameDraft.trim(),
        avatarUrl: avatarDraft.trim(),
        onboardingCompleted: profile?.onboardingCompleted ?? true,
      });
      setProfile(prev => ({
        id: prev?.id || '',
        createdAt: prev?.createdAt || new Date().toISOString(),
        onboardingCompleted: prev?.onboardingCompleted ?? true,
        displayName: nameDraft.trim(),
        avatarUrl: avatarDraft.trim(),
      }));
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="account-menu" ref={menuRef}>
      <button
        className={`account-trigger ${open ? 'open' : ''}`}
        onClick={() => setOpen(v => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="account-avatar">
          {profile?.avatarUrl ? <img src={profile.avatarUrl} alt="" /> : initials}
        </span>
        {displayName && <span className="account-trigger-name">{displayName}</span>}
        <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />
      </button>

      {open && (
        <div className="account-dropdown" role="menu">
          <div className="account-dropdown-header">
            <span className="account-avatar lg">
              {profile?.avatarUrl ? <img src={profile.avatarUrl} alt="" /> : initials}
            </span>
            <div className="account-dropdown-identity">
              <div className="account-dropdown-name">{displayName || 'Sin nombre configurado'}</div>
              <div className="account-dropdown-email">{email}</div>
            </div>
          </div>

          {editing ? (
            <div className="account-profile-form">
              <div className="form-group">
                <label className="form-label">Nombre para mostrar</label>
                <input
                  className="form-input"
                  type="text"
                  value={nameDraft}
                  onChange={e => setNameDraft(e.target.value)}
                  placeholder="Tu nombre"
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label className="form-label">URL de foto de perfil</label>
                <input
                  className="form-input"
                  type="url"
                  value={avatarDraft}
                  onChange={e => setAvatarDraft(e.target.value)}
                  placeholder="https://..."
                />
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={handleSaveProfile} disabled={saving}>
                  <Save size={14} /> {saving ? 'Guardando…' : 'Guardar'}
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => setEditing(false)} disabled={saving}>
                  <X size={14} />
                </button>
              </div>
            </div>
          ) : (
            <div className="account-dropdown-body">
              <button className="account-dropdown-item" onClick={() => setEditing(true)}>
                <User size={16} /> Editar perfil
              </button>
              <Link href="/ajustes" className="account-dropdown-item" onClick={() => setOpen(false)}>
                <Settings size={16} /> Ajustes de la empresa
              </Link>
              <div className="account-dropdown-divider" />
              <form action="/auth/signout" method="post">
                <button type="submit" className="account-dropdown-item danger" style={{ width: '100%' }}>
                  <LogOut size={16} /> Cerrar sesión
                </button>
              </form>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
