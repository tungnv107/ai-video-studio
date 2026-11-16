'use client';
import { useEffect, useRef, useState } from 'react';
import { Copy, KeyRound, RefreshCw, Save, Trash2 } from 'lucide-react';
import { clientApi } from './client-api';

type AppConfig = { platform: string; clientId: string; configured: boolean; hasSecret: boolean; version: number; connectedAccounts: number; redirectUri: string; webhookUrl: string | null };

export default function OAuthAppSettings({ platform, onUpdated }: { platform: 'youtube' | 'tiktok'; onUpdated: () => Promise<void> }) {
  const name = platform === 'youtube' ? 'YouTube' : 'TikTok';
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [clientId, setClientId] = useState(''), [secret, setSecret] = useState('');
  const [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [message, setMessage] = useState('');
  const [expanded, setExpanded] = useState(false);
  const loadGeneration = useRef(0);
  const endpoint = 'integrations/' + platform + '/app';
  const changed = !!config && (clientId.trim() !== config.clientId || !!secret.trim());

  function accept(value: AppConfig) { setConfig(value); setClientId(value.clientId); setSecret(''); setConfirmed(false); }
  async function load() {
    const generation = ++loadGeneration.current;
    setBusy(true); setError('');
    try {
      const value = await clientApi<AppConfig>(endpoint);
      if (generation !== loadGeneration.current) return;
      accept(value);
      // A delayed response must not close a section the owner has already opened.
      if (!value.configured) setExpanded(true);
    }
    catch (error) { if (generation === loadGeneration.current) { setError((error as Error).message); setExpanded(true); } }
    finally { if (generation === loadGeneration.current) setBusy(false); }
  }
  useEffect(() => { void load(); return () => { loadGeneration.current++; }; }, [endpoint]);

  async function save(event: React.FormEvent) {
    event.preventDefault(); if (!config) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const value = await clientApi<AppConfig>(endpoint, 'PUT', { clientId: clientId.trim(), ...(secret.trim() ? { clientSecret: secret.trim() } : {}), expectedVersion: config.version, confirmDisconnect: confirmed });
      accept(value); await onUpdated();
      setMessage('Đã lưu cấu hình ' + name + ' cho studio này. Bạn có thể kết nối tài khoản bên trên.');
    } catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }
  async function clear() {
    if (!config || !window.confirm('Xóa cấu hình ' + name + ' của studio này? Các tài khoản ' + name + ' sẽ bị ngắt kết nối và yêu cầu đăng đang chờ sẽ bị hủy.')) return;
    setBusy(true); setError(''); setMessage('');
    try {
      accept(await clientApi<AppConfig>(endpoint, 'DELETE', { expectedVersion: config.version, confirmDisconnect: true }));
      await onUpdated(); setMessage('Đã xóa cấu hình ' + name + ' của studio này.');
    } catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }
  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); setMessage('Đã sao chép URL.'); }
    catch { setMessage('Chọn và sao chép URL trong ô bên cạnh.'); }
  }
  return <details className="oauth-settings" open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}>
    <summary><KeyRound size={16} />Cấu hình ứng dụng {name}<span className={'subtle-pill ' + (config?.configured ? 'oauth-configured' : '')}>{config?.configured ? 'Đã cấu hình' : 'Chưa cấu hình'}</span></summary>
    <p className="muted">Cấu hình riêng cho studio hiện tại. Chỉ chủ sở hữu được xem và sửa. Secret được mã hóa, không hiển thị lại.</p>
    {!config ? <button className="button" disabled={busy} onClick={() => void load()}><RefreshCw size={15} />{busy ? 'Đang tải cấu hình…' : 'Tải lại cấu hình'}</button> : <>
      <form className="form-grid" onSubmit={save}>
        <label>{name} {platform === 'youtube' ? 'Client ID' : 'Client Key'}<input aria-label={name + (platform === 'youtube' ? ' Client ID' : ' Client Key')} value={clientId} onChange={event => setClientId(event.target.value)} required maxLength={255} autoComplete="off" spellCheck={false} disabled={busy} /></label>
        <label>{name} Client Secret<input aria-label={name + ' Client Secret'} type="password" value={secret} onChange={event => setSecret(event.target.value)} required={!config.hasSecret || clientId.trim() !== config.clientId} maxLength={2000} autoComplete="new-password" disabled={busy} placeholder={config.hasSecret ? 'Để trống để giữ secret hiện tại' : 'Nhập Client Secret của ứng dụng'} /><small>{config.hasSecret ? 'Đã lưu secret. Khi đổi Client ID/Key, cần nhập secret tương ứng.' : 'Lấy thông tin từ ứng dụng Google Cloud hoặc TikTok Developer của bạn.'}</small></label>
        {config.connectedAccounts > 0 && <label className="checkbox"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} required={changed} disabled={busy} />Khi thay đổi cấu hình, tôi đồng ý ngắt {config.connectedAccounts} tài khoản {name} và hủy yêu cầu đăng đang chờ để kết nối lại.</label>}
        <div className="detail-actions"><button className="button primary" disabled={busy}><Save size={15} />Lưu cấu hình {name}</button><button className="button" type="button" disabled={busy} onClick={() => void load()}><RefreshCw size={15} />Tải lại</button>{config.configured && <button className="text-button danger-text" type="button" disabled={busy} onClick={() => void clear()}><Trash2 size={15} />Xóa cấu hình {name}</button>}</div>
      </form>
      <div className="oauth-urls"><label>Redirect URI {name}<div className="oauth-copy"><input aria-label={'Redirect URI ' + name} value={config.redirectUri} readOnly onFocus={event => event.target.select()} /><button className="icon-button" aria-label={'Sao chép Redirect URI ' + name} onClick={() => void copy(config.redirectUri)}><Copy size={15} /></button></div><small>Thêm chính xác URL này vào danh sách redirect của ứng dụng {name}.</small></label>{platform === 'tiktok' && (config.webhookUrl ? <label>Webhook URL TikTok<div className="oauth-copy"><input aria-label="Webhook URL TikTok" value={config.webhookUrl} readOnly onFocus={event => event.target.select()} /><button className="icon-button" aria-label="Sao chép Webhook URL TikTok" onClick={() => void copy(config.webhookUrl!)}><Copy size={15} /></button></div><small>Dùng URL riêng này trong cài đặt webhook của ứng dụng TikTok.</small></label> : <p className="muted">Webhook URL của studio sẽ xuất hiện sau khi lưu cấu hình TikTok.</p>)}</div>
    </>}
    {error && <div role="alert" className="alert error">{error}</div>}{message && <p role="status" className="note">{message}</p>}
  </details>;
}
