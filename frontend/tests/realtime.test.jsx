import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import axios from 'axios';
import AdminPresencePanel from '../src/components/AdminPresencePanel';
import TopicAlertsModal from '../src/components/TopicAlertsModal';
import LoginView from '../src/components/LoginView';
const { handlers, socket } = vi.hoisted(() => {
  const handlers = {};
  return { handlers, socket: { on: vi.fn((name, fn) => { handlers[name] = fn; }), off: vi.fn(), emit: vi.fn() } };
});
vi.mock('axios', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
vi.mock('../src/context/SocketContext', () => ({ useSocket: () => ({ socket, isConnected: true, notificationTick: 0 }) }));
vi.mock('../src/context/AuthContext', () => ({ useAuth: () => ({ loginWithGoogle: vi.fn() }) }));
vi.mock('@react-oauth/google', () => ({ GoogleLogin: () => <button>Google sign-in test control</button> }));
beforeEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });

it('shows unique member activity and updates it from live events', async () => {
  axios.get.mockResolvedValue({ data: { users: [{ userId: 'one', name: 'Ada', role: 'student', state: 'active' }], active: 1, away: 0, connected: 1, updatedAt: new Date().toISOString() } });
  render(<AdminPresencePanel />);
  await screen.findByText('Live'); fireEvent.click(screen.getByText('Show connected members (1)'));
  expect(screen.getByText('Ada')).toBeVisible(); expect(screen.getByText('Active now')).toBeVisible();
  handlers['admin:presence']({ users: [{ userId: 'one', name: 'Ada', role: 'student', state: 'away' }], active: 0, away: 1, connected: 1, updatedAt: new Date(Date.now() + 1000).toISOString() });
  await screen.findByText('Away'); expect(socket.emit).toHaveBeenCalledWith('presence:subscribe');
});
it('does not represent a failed presence request as zero active members', async () => {
  axios.get.mockRejectedValue(new Error('Unavailable'));
  render(<AdminPresencePanel />); await screen.findByText('Reconnecting');
  fireEvent.click(screen.getByText('Show connected members'));
  expect(screen.getByText(/Activity data is unavailable/)).toBeVisible();
  expect(screen.queryByText('No signed-in members are connected.')).not.toBeInTheDocument();
});
it('follows the current search as theses only and excludes unrelated inbox messages', async () => {
  axios.get.mockImplementation(url => Promise.resolve({ data: url.includes('notifications') ? [{ _id: 'payment', type: 'payment_approved', title: 'Payment message' }] : [] }));
  axios.post.mockResolvedValue({ data: { alerts: [] } });
  render(<TopicAlertsModal isOpen onClose={vi.fn()} initialTopic="crop disease" />);
  await screen.findByDisplayValue('crop disease');
  expect(screen.queryByText('Payment message')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Publication type'), { target: { value: 'thesis' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add Alert' }));
  await waitFor(() => expect(axios.post).toHaveBeenCalledWith('/api/user/alerts', { topic: 'crop disease', category: 'All Disciplines', publicationType: 'thesis' }));
});
it('explains partial online source failures after checking alerts', async () => {
  axios.get.mockImplementation(url => Promise.resolve({ data: url.includes('alerts') ? [{ _id: 'a', topic: 'crop disease', category: 'All Disciplines' }] : [] }));
  axios.post.mockResolvedValue({ data: { notificationsCreated: 0, sourceWarnings: ['crop disease'] } });
  render(<TopicAlertsModal isOpen onClose={vi.fn()} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Check Matches Now' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Check Matches Now' }));
  expect(await screen.findByText(/Some online sources could not be checked/)).toBeVisible();
});
it('accepts a valid Google client ID containing a hyphen', () => {
  vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '123456-validclient.apps.googleusercontent.com');
  render(<LoginView />);
  expect(screen.getByRole('button', { name: 'Google sign-in test control' })).toBeVisible();
});
