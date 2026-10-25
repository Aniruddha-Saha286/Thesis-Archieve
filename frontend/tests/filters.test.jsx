import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import axios from 'axios';
import { parseUrlState, buildUrl } from '../src/utils/urlState';
import DiscoveryFiltersPanel from '../src/components/DiscoveryFiltersPanel';
import StudentManagementModal from '../src/components/StudentManagementModal';
import SavedPapersModal from '../src/components/SavedPapersModal';
vi.mock('axios', () => ({ default: { get: vi.fn() } }));
vi.mock('../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'filter-test' } }) }));
vi.mock('../src/context/SocketContext', () => ({ useSocket: () => ({ socket: null, showNotice: vi.fn() }) }));
beforeEach(() => vi.clearAllMocks());

it('restores every catalog filter through a shareable URL', () => {
  const state = { ...parseUrlState(''), q: 'coastal', subjectId: 'ai-ml', category: 'Artificial Intelligence and Machine Learning', fieldId: '17', fieldName: 'Computer Science', publisher: 'IEEE',
    institution: { id: 'I123', name: 'Fixture University', countryCode: 'BD' }, institutionMode: 'awarding', countries: ['BD', 'US'], author: { id: 'A123', name: 'Ada' }, citations: '50', academicOnly: false,
    degree: 'msc', program: 'cse', type: 'thesis', sort: 'citations', code: true, data: true, pdf: true, oa: true, from: '2020', to: '2026' };
  expect(parseUrlState(new URL(buildUrl(state), 'https://fixture.invalid').search)).toEqual(state);
});
it('a university shortcut without an ID survives a reload', () => {
  const restored = parseUrlState(new URL(buildUrl({ institution: { name: 'BRAC University', countryCode: 'BD' } }), 'https://fixture.invalid').search);
  expect(restored.institution).toEqual({ name: 'BRAC University', countryCode: 'BD' });
});
it('does not put catalog filters into an unrelated destination URL', () => {
  const url = buildUrl({ view: 'library', publisher: 'IEEE', subjectId: 'ai-ml', institution: { name: 'University' }, citations: '50' });
  expect(url).toBe('/?view=library');
});
it('ignores malformed filter IDs and invalid citation values in URLs', () => {
  const state = parseUrlState('?author=%24set&institution=%24ne&citations=50junk&field=bad&countries=bd,us,INVALID');
  expect(state.author).toBeNull(); expect(state.institution).toBeNull(); expect(state.citations).toBe(''); expect(state.fieldId).toBe(''); expect(state.countries).toEqual(['BD', 'US']);
});
it('clearing institution input prevents a delayed result from reopening old suggestions', async () => {
  let resolveRequest;
  axios.get.mockImplementation(() => new Promise(resolve => { resolveRequest = resolve; }));
  render(<DiscoveryFiltersPanel />);
  const input = screen.getByRole('combobox', { name: 'Search universities' });
  fireEvent.change(input, { target: { value: 'Harvard' } });
  await waitFor(() => expect(axios.get).toHaveBeenCalled());
  fireEvent.change(input, { target: { value: '' } });
  await act(async () => resolveRequest({ data: [{ id: 'I1', name: 'Old Harvard result' }] }));
  expect(screen.queryByRole('option', { name: /Old Harvard/ })).not.toBeInTheDocument();
  expect(input).toHaveAttribute('aria-expanded', 'false');
});
it('institution suggestions follow the academic-only switch and support the keyboard', async () => {
  axios.get.mockResolvedValue({ data: [{ id: 'I123', name: 'Fixture University', countryCode: 'BD' }] });
  const select = vi.fn();
  const { rerender } = render(<DiscoveryFiltersPanel academicOnly onSelectInstitution={select} />);
  const input = screen.getByRole('combobox', { name: 'Search universities' });
  fireEvent.change(input, { target: { value: 'Fixture' } });
  await screen.findByRole('option', { name: /Fixture University/ });
  rerender(<DiscoveryFiltersPanel academicOnly={false} onSelectInstitution={select} />);
  await waitFor(() => expect(axios.get).toHaveBeenLastCalledWith('/api/institutions/suggest', expect.objectContaining({ params: { q: 'Fixture', academic_only: false, limit: 7 } })));
  await screen.findByRole('option', { name: /Fixture University/ });
  fireEvent.keyDown(input, { key: 'ArrowDown' }); fireEvent.keyDown(input, { key: 'Enter' });
  expect(select).toHaveBeenCalledWith(expect.objectContaining({ id: 'I123' }));
});
it('a suggestion outage is explained rather than shown as no universities found', async () => {
  axios.get.mockRejectedValue(new Error('Provider down'));
  render(<DiscoveryFiltersPanel />);
  fireEvent.change(screen.getByRole('combobox', { name: 'Search universities' }), { target: { value: 'Fixture' } });
  expect(await screen.findByRole('alert')).toHaveTextContent('University suggestions are unavailable');
  expect(screen.queryByText('No institution found.')).not.toBeInTheDocument();
});
it('student status tabs combine with case-insensitive trimmed roster searches', async () => {
  axios.get.mockResolvedValue({ data: [
    { _id: 'one', name: 'Ada Coastal', email: 'ada@example.org', university: 'Fixture University', studentId: 'S100', researchDomain: 'Robotics', status: 'approved' },
    { _id: 'two', name: 'Ben Coastal', email: 'ben@example.org', university: 'Other University', status: 'banned' },
    { _id: 'three', name: 'Cam Pending', status: 'pending' },
  ] });
  render(<StudentManagementModal isOpen onClose={vi.fn()} />);
  await screen.findByText('Ada Coastal');
  fireEvent.change(screen.getByLabelText('Search student roster'), { target: { value: '  COASTAL  ' } });
  expect(screen.getByText('Ada Coastal')).toBeVisible(); expect(screen.getByText('Ben Coastal')).toBeVisible(); expect(screen.queryByText('Cam Pending')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Banned (1)' }));
  expect(screen.getByText('Ben Coastal')).toBeVisible(); expect(screen.queryByText('Ada Coastal')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Pending (1)' }));
  expect(screen.getByText('No student records found.')).toBeVisible();
  fireEvent.change(screen.getByLabelText('Search student roster'), { target: { value: '' } });
  expect(screen.getByText('Cam Pending')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Active (1)' }));
  for (const value of ['  s100 ', 'ADA@EXAMPLE.ORG', 'Robotics', 'fixture university']) {
    fireEvent.change(screen.getByLabelText('Search student roster'), { target: { value } });
    expect(screen.getByText('Ada Coastal')).toBeVisible();
  }
});
it('saved-paper searches match title, author and notes with surrounding whitespace', async () => {
  axios.get.mockResolvedValue({ data: [
    { paperId: 'one', title: 'Coastal sensing', authors: 'Ada Researcher', notes: 'Useful benchmark' },
    { paperId: 'two', title: 'Mountain ecology', authors: 'Ben Author', notes: 'Field observations' },
  ] });
  render(<SavedPapersModal isOpen onClose={vi.fn()} />);
  await screen.findByText('Coastal sensing');
  const input = screen.getByPlaceholderText('Filter saved papers by title, author, or personal research note...');
  for (const value of ['  COASTAL  ', 'ada researcher', '  BENCHMARK ']) {
    fireEvent.change(input, { target: { value } });
    expect(screen.getByText('Coastal sensing')).toBeVisible(); expect(screen.queryByText('Mountain ecology')).not.toBeInTheDocument();
  }
  fireEvent.change(input, { target: { value: 'missing' } });
  expect(screen.getByText('No saved papers match your search term.')).toBeVisible();
  fireEvent.change(input, { target: { value: '   ' } });
  expect(screen.getByText('Coastal sensing')).toBeVisible(); expect(screen.getByText('Mountain ecology')).toBeVisible();
});
