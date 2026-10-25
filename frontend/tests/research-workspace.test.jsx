import { it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import axios from 'axios';
import ResearchWorkspace from '../src/components/ResearchWorkspace';
import FocusSession from '../src/components/FocusSession';
import SearchLaunchpad from '../src/components/SearchLaunchpad';
import { readingSummary, supervisorBrief } from '../src/utils/researchWorkspace';
vi.mock('axios', () => ({ default: { get: vi.fn(), put: vi.fn(), patch: vi.fn() } }));
vi.mock('../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'workspace-test-owner' } }) }));
const plan = () => ({ title: '', goal: '', targetDate: '', tasks: [{ id: 'question', title: 'Frame my question', done: false }], version: 0 });
const papers = [{ paperId: 'paper-one', title: 'Synthetic coastal research', authors: 'Fixture Author', readingStatus: 'Reading', doi: '10.1234/fixture' }];
beforeEach(() => {
  vi.clearAllMocks();
  axios.get.mockImplementation(url => Promise.resolve({ data: url.includes('research-plan') ? { plan: plan() } : structuredClone(papers) }));
});
afterEach(() => vi.useRealTimers());
it('saves a customized roadmap and shows server acknowledgement', async () => {
  axios.put.mockImplementation((url, body) => Promise.resolve({ data: { plan: { ...body, version: body.version + 1, updatedAt: new Date().toISOString() } } }));
  render(<ResearchWorkspace />);
  fireEvent.change(await screen.findByLabelText('Working title'), { target: { value: 'Coastal flood prediction' } });
  fireEvent.click(screen.getByRole('checkbox', { name: 'Complete Frame my question' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save roadmap' }));
  await screen.findByText('Roadmap saved to your account.');
  expect(axios.put).toHaveBeenCalledWith('/api/user/research-plan', expect.objectContaining({ title: 'Coastal flood prediction', version: 0, tasks: [{ id: 'question', title: 'Frame my question', done: true }] }));
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
});
it('preserves the current draft on a conflict instead of overwriting it', async () => {
  axios.put.mockRejectedValue({ response: { status: 409, data: { message: 'Changed in another tab.' } } });
  render(<ResearchWorkspace />); fireEvent.change(await screen.findByLabelText('Working title'), { target: { value: 'My unsaved question' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save roadmap' }));
  await screen.findByRole('alert'); expect(screen.getByLabelText('Working title')).toHaveValue('My unsaved question');
  expect(screen.getByRole('button', { name: 'Save roadmap' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Replace my draft with the saved version' })).toBeVisible();
});
it('a failed reading-status save leaves the original status intact', async () => {
  axios.patch.mockRejectedValue(new Error('Offline'));
  render(<ResearchWorkspace />);
  const select = await screen.findByLabelText('Reading status for Synthetic coastal research');
  fireEvent.change(select, { target: { value: 'Reviewed' } });
  await screen.findByText('Reading progress could not be saved. Please try again.');
  expect(select).toHaveValue('Reading');
});
it('the focus timer pauses accurately and can be reset', () => {
  vi.useFakeTimers(); render(<FocusSession />);
  fireEvent.click(screen.getByRole('button', { name: 'Start focus' }));
  act(() => vi.advanceTimersByTime(61000)); expect(screen.getByRole('timer')).toHaveTextContent('23:59');
  fireEvent.click(screen.getByRole('button', { name: 'Pause session' }));
  act(() => vi.advanceTimersByTime(60000)); expect(screen.getByRole('timer')).toHaveTextContent('23:59');
  fireEvent.click(screen.getByRole('button', { name: 'Reset focus timer' })); expect(screen.getByRole('timer')).toHaveTextContent('25:00');
});
it('search angles wait for explicit selection before submitting a query', () => {
  const search = vi.fn(); render(<SearchLaunchpad onSearch={search} />);
  fireEvent.click(screen.getByText('A topic is a starting point. Find your angle.'));
  fireEvent.change(screen.getByLabelText('What are you curious about?'), { target: { value: 'coastal flood prediction' } });
  expect(search).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: /Map the field/ })); expect(search).toHaveBeenCalledWith('coastal flood prediction systematic review');
});
it('a progress brief reflects real milestones and reading states', () => {
  expect(readingSummary(papers)).toEqual({ Reading: 1, 'To read': 0, Reviewed: 0, 'To cite': 0 });
  const text = supervisorBrief({ ...plan(), title: 'Coastal thesis' }, papers, new Date('2026-10-23T12:00:00Z'));
  expect(text).toContain('Working title: Coastal thesis'); expect(text).toContain('[ ] Frame my question');
  expect(text).toContain('Synthetic coastal research (DOI: 10.1234/fixture)');
  expect(text).toContain('not an assessment of research quality or originality');
});
