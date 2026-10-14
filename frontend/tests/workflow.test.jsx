import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import axios from 'axios';
import TopicCheck from '../src/components/TopicCheck';
import { analyzeTopic } from '../src/utils/topicAnalysis';
import { parseUrlState, buildUrl } from '../src/utils/urlState';
vi.mock('axios', () => ({ default: { get: vi.fn() } }));
vi.mock('../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'workflow-test-user' } }) }));
beforeEach(() => vi.clearAllMocks());
it('round trips Radar deep links independently of catalog filters', () => {
  const state = parseUrlState('?view=radar&rq=crop+imaging&rv=iccv&rr=7&rm=activity&rp=DBLP&ry=2025');
  expect(parseUrlState(buildUrl(state)).radar).toEqual(state.radar);
  expect(state.radar).toEqual({ query: 'crop imaging', venue: 'iccv', range: '7', mode: 'activity', provider: 'DBLP', year: '2025' });
  expect(buildUrl({ ...state, view: 'discover', q: 'new idea', venue: 'cvpr' })).not.toContain('rq=');
});
it('missing matches never establish originality; retrieved papers remain in the report', () => {
  const empty = analyzeTopic({ topic: 'agriculture crop disease' });
  expect(empty.verdict.advice).toContain('do not establish originality');
  const paper = { id: 'actual-fixture', title: 'Agriculture crop disease', authors: [{ name: 'Fixture author' }] };
  const report = analyzeTopic({ topic: paper.title, records: [paper, paper] });
  expect(report.checkedCount).toBe(1); expect(report.close[0].record).toMatchObject(paper);
});
it('prefills an idea without making a paper search and updates transferred context', () => {
  const { rerender } = render(<TopicCheck initialTopic="Agriculture crop disease" />);
  expect(screen.getByDisplayValue('Agriculture crop disease')).toBeVisible(); expect(axios.get).not.toHaveBeenCalled();
  rerender(<TopicCheck initialTopic="Medical image segmentation" />);
  expect(screen.getByDisplayValue('Medical image segmentation')).toBeVisible(); expect(axios.get).not.toHaveBeenCalled();
  expect(screen.getByText(/new check uses one daily paper search/)).toBeVisible();
});
it('partial source failures yield limited evidence and a working literature action', async () => {
  axios.get.mockImplementation((path, options) => {
    if (path === '/api/datasets') return Promise.resolve({ data: { datasets: [] } });
    if (options.params.publicationType === 'thesis') return Promise.reject(new Error('fixture outage'));
    return Promise.resolve({ data: { records: [{ id: 'supporting-fixture', title: 'Unrelated satellite imaging record' }], partialResults: true, searchContextId: 'fixture-context' } });
  });
  const search = vi.fn(); render(<TopicCheck initialTopic="Coastal crop classification prototype" onSearchInDiscover={search} />);
  fireEvent.click(screen.getByRole('button', { name: 'Check my idea', exact: true }));
  await screen.findByText('No close match in the available evidence');
  expect(screen.getByText(/Some sources did not respond/)).toBeVisible();
  const supporting = screen.getByRole('button', { name: /Find supporting papers/i });
  fireEvent.click(supporting); expect(search).toHaveBeenCalledWith(expect.any(String), 'fixture-context');
  await waitFor(() => expect(axios.get).toHaveBeenCalledTimes(3));
});
