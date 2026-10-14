import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';
import ResearchRadar from '../src/components/ResearchRadar';
import ResearchSuggestionInput from '../src/components/ResearchSuggestionInput';
vi.mock('axios', () => ({ default: { get: vi.fn(), post: vi.fn(), isCancel: () => false } }));
vi.mock('../src/components/ThesisCard', () => ({ default: ({ thesis, onAddToCompare, onViewDetail }) => <div>{thesis.title}<button onClick={() => onAddToCompare(thesis)}>Compare</button><button onClick={() => onViewDetail(thesis)}>Read</button></div> }));
const paper = { id: 'radar_one', title: 'Medical image segmentation with vision transformers', venue: 'CVPR', publishedYear: 2026, reviewLabel: 'Published · peer reviewed', sources: [{ provider: 'CVF' }] };
const response = { data: { records: [paper], sync: [], basis: 'Source publication dates.', nextCursor: 'next' } };
describe('Research Radar', () => {
  beforeEach(() => { vi.clearAllMocks(); axios.get.mockResolvedValue(response); });
  it('has independent venue/source filters, accessible labels and existing actions', async () => {
    const compare = vi.fn(), detail = vi.fn(); render(<ResearchRadar onCompare={compare} onViewDetail={detail} />);
    await screen.findByText(paper.title); expect(screen.getByText(paper.reviewLabel)).toBeVisible();
    fireEvent.change(screen.getByLabelText('Conference or journal'), { target: { value: 'iclr' } });
    await waitFor(() => expect(axios.get).toHaveBeenLastCalledWith('/api/research/radar', expect.objectContaining({ params: expect.objectContaining({ venue: 'iclr', provider: '' }) })));
    fireEvent.click(screen.getAllByText('Compare')[0]); expect(compare).toHaveBeenCalledWith(paper);
    fireEvent.click(screen.getAllByText('Read')[0]); expect(detail).toHaveBeenCalledWith(paper);
  });
  it('preserves results while refreshing and on partial failures', async () => {
    render(<ResearchRadar />); await screen.findByText(paper.title);
    let reject; axios.get.mockImplementationOnce(() => new Promise((_resolve, rejecter) => { reject = rejecter; }));
    fireEvent.click(screen.getByLabelText('Refresh Research Radar'));
    expect(screen.getByText(paper.title)).toBeVisible(); expect(screen.getByText(/previous results remain/)).toBeVisible();
    reject(new Error('offline')); await screen.findByRole('alert'); expect(screen.getByText(paper.title)).toBeVisible();
  });
  it('loads pages, resets filters and follows with existing allowance', async () => {
    axios.post.mockResolvedValue({}); render(<ResearchRadar />); await screen.findByText(paper.title);
    fireEvent.click(screen.getByText('Load more papers')); await waitFor(() => expect(axios.get).toHaveBeenLastCalledWith('/api/research/radar', expect.objectContaining({ params: expect.objectContaining({ cursor: 'next' }) })));
    fireEvent.change(screen.getByLabelText('Conference or journal'), { target: { value: 'cvpr' } });
    fireEvent.click(screen.getByText('Follow topic / venue')); await waitFor(() => expect(axios.post).toHaveBeenCalledWith('/api/user/alerts', { topic: 'CVPR', venueId: 'cvpr' }));
    fireEvent.click(screen.getByText('Clear all')); expect(screen.getByLabelText('Conference or journal')).toHaveValue('');
  });
  it('supports debounced keyboard topic and venue suggestions', async () => {
    const user = userEvent.setup(), venue = vi.fn(); render(<ResearchSuggestionInput value="CV" onChange={vi.fn()} onSelectVenue={venue} />);
    const input = screen.getByRole('combobox'); await user.click(input); await screen.findByRole('listbox');
    await user.keyboard('{ArrowDown}{Enter}'); expect(venue).toHaveBeenCalledWith('cvpr'); expect(input).toHaveAttribute('aria-expanded', 'false');
  });
  it('distinguishes an uninitialized index and transfers raw context without a search', async () => {
    axios.get.mockResolvedValueOnce({ data: { records: [], sync: [], health: { hasIndexedPapers: false, state: 'disabled', configuredJobs: 23 } } });
    const search = vi.fn(), idea = vi.fn(); render(<ResearchRadar onSearchPapers={search} onCheckIdea={idea} />);
    await screen.findByText('Research Radar is getting ready.'); expect(screen.getByText(/23 configured jobs/)).toBeVisible();
    fireEvent.change(screen.getByLabelText('Search topics and venues'), { target: { value: 'Agriculture imaging' } });
    fireEvent.click(screen.getByText('Find papers instead')); expect(search).toHaveBeenCalledWith({ query: 'Agriculture imaging', venue: '', year: '' });
    fireEvent.click(screen.getByText('Check this idea')); expect(idea).toHaveBeenCalledWith('Agriculture imaging'); expect(axios.post).not.toHaveBeenCalled();
  });
  it('distinguishes filter misses and indexing activity from missing research', async () => {
    axios.get.mockResolvedValue({ data: { records: [], sync: [], health: { hasIndexedPapers: true, state: 'indexed' } } });
    render(<ResearchRadar />); await screen.findByText('No papers match these filters.');
    fireEvent.change(screen.getByLabelText('Date basis'), { target: { value: 'activity' } });
    await screen.findByText(/Tracked sources have not yielded/); fireEvent.click(screen.getByText('Browse publication year'));
    expect(screen.getByLabelText('Date basis')).toHaveValue('publication'); expect(screen.getByLabelText('Time window')).toHaveValue('year');
  });
  it('shows partial coverage without removing normalized papers', async () => {
    axios.get.mockResolvedValue({ data: { ...response.data, health: { state: 'partial_failure', hasIndexedPapers: true } } });
    render(<ResearchRadar />); await screen.findByText(paper.title); expect(screen.getByText(/coverage may be incomplete/)).toBeVisible();
    expect(screen.getByLabelText('Time window')).toHaveValue('year');
  });
  it('follows immediate input and explains duplicate and quota failures', async () => {
    axios.post.mockRejectedValueOnce({ response: { status: 409 } }).mockRejectedValueOnce({ response: { status: 403, data: { code: 'FEATURE_LOCKED' } } });
    render(<ResearchRadar />); await screen.findByText(paper.title);
    fireEvent.change(screen.getByLabelText('Search topics and venues'), { target: { value: 'new agriculture idea' } });
    fireEvent.click(screen.getByText('Follow topic / venue'));
    await screen.findByText('You already follow this topic and venue.'); expect(axios.post).toHaveBeenCalledWith('/api/user/alerts', { topic: 'new agriculture idea', venueId: '' });
    fireEvent.click(screen.getByText('Follow topic / venue')); await screen.findByText(/allowance is full/);
  });
  it('aborts stale responses and deduplicates loaded pages', async () => {
    let resolveOld; axios.get.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
    render(<ResearchRadar />); fireEvent.change(screen.getByLabelText('Conference or journal'), { target: { value: 'iclr' } });
    await screen.findByText(paper.title); resolveOld({ data: { ...response.data, records: [{ ...paper, id: 'stale', title: 'Outdated response' }] } });
    await waitFor(() => expect(screen.queryByText('Outdated response')).toBeNull());
    fireEvent.click(screen.getByText('Load more papers')); await waitFor(() => expect(axios.get).toHaveBeenCalledTimes(3)); expect(screen.getAllByText(paper.title)).toHaveLength(1);
    expect(axios.get.mock.calls[0][1].signal.aborted).toBe(true);
  });
  it('does not request a hidden feed and preserves filters across tab visibility', async () => {
    const { rerender } = render(<ResearchRadar active={false} />); expect(axios.get).not.toHaveBeenCalled();
    rerender(<ResearchRadar active />); await screen.findByText(paper.title);
    fireEvent.change(screen.getByLabelText('Conference or journal'), { target: { value: 'iccv' } });
    await waitFor(() => expect(axios.get).toHaveBeenCalledTimes(2));
    rerender(<ResearchRadar active={false} />); rerender(<ResearchRadar active />);
    expect(screen.getByLabelText('Conference or journal')).toHaveValue('iccv');
  });
  it('restricts alternate-year editions and clears incompatible selections visibly', async () => {
    render(<ResearchRadar />); await screen.findByText(paper.title);
    fireEvent.change(screen.getByLabelText('Edition year'), { target: { value: '2026' } });
    fireEvent.change(screen.getByLabelText('Conference or journal'), { target: { value: 'iccv' } });
    expect(screen.getByLabelText('Edition year')).toHaveValue(''); expect(screen.getByText(/Edition cleared/)).toBeVisible();
    expect([...screen.getByLabelText('Edition year').options].map(o => o.value)).not.toContain('2026');
  });
});
