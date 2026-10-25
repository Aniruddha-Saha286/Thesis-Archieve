import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import axios from 'axios';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
vi.mock('axios', () => ({ default: { get: vi.fn(), post: vi.fn(), defaults: { headers: { common: {} } }, interceptors: { request: { use: vi.fn() } } } }));
function Account() {
  const { user, loading, logout, refreshUser } = useAuth();
  return <><p>{loading ? 'Loading account' : user ? `Account: ${user.status}` : 'Signed out'}</p><button onClick={logout}>Sign out</button><button onClick={refreshUser}>Refresh account</button></>;
}
const user = { id: 'session-fixture', role: 'student', status: 'approved', isProfileComplete: true };
beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); localStorage.setItem('thesis_vault_token', 'synthetic-session'); });
it('keeps a suspended account signed in for status updates and restores it after reinstatement', async () => {
  axios.get.mockResolvedValue({ data: { user } });
  render(<AuthProvider><Account /></AuthProvider>);
  await screen.findByText('Account: approved');
  localStorage.setItem('tta:offline:v1:library-fixture', 'private cached notes');
  axios.get.mockResolvedValue({ data: { user: { ...user, status: 'banned', banReason: 'Test' } } });
  fireEvent.click(screen.getByText('Refresh account')); await screen.findByText('Account: banned');
  expect(localStorage.getItem('thesis_vault_token')).toBe('synthetic-session');
  expect(localStorage.getItem('tta:offline:v1:library-fixture')).toBeNull();
  axios.get.mockResolvedValue({ data: { user } });
  fireEvent.click(screen.getByText('Refresh account')); await screen.findByText('Account: approved');
});
it('does not sign out a member during a temporary server failure', async () => {
  axios.get.mockResolvedValueOnce({ data: { user } }).mockRejectedValue({ response: { status: 503 } });
  render(<AuthProvider><Account /></AuthProvider>); await screen.findByText('Account: approved');
  fireEvent.click(screen.getByText('Refresh account'));
  await waitFor(() => expect(axios.get).toHaveBeenCalledTimes(2));
  expect(screen.getByText('Account: approved')).toBeVisible();
  expect(localStorage.getItem('thesis_vault_token')).toBe('synthetic-session');
});
it('a delayed account response cannot restore a session after sign-out', async () => {
  let complete;
  axios.get.mockImplementation(() => new Promise(resolve => { complete = resolve; }));
  render(<AuthProvider><Account /></AuthProvider>);
  fireEvent.click(screen.getByText('Sign out')); await screen.findByText('Signed out');
  complete({ data: { user } });
  await waitFor(() => expect(localStorage.getItem('thesis_vault_token')).toBeNull());
  expect(screen.getByText('Signed out')).toBeVisible();
});
