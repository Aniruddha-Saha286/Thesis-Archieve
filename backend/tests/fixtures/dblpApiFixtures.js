/**
 * DBLP publication search fixtures
 * (GET https://dblp.org/search/publ/api?q=...&format=json&h=<size>&f=<offset>)
 *
 * These are hand-built to the shape of a real DBLP response. They are NOT a capture of a
 * live call: the test machine cannot reach dblp.org, and the titles, people, keys and
 * links below are made up (DOIs use the 10.5555 test prefix, arXiv numbers use month "00"
 * so they can never point at a real paper).
 *
 * Things about the real shape that these fixtures copy on purpose:
 *   - every number is sent as text ("@total": "8", "year": "2021")
 *   - "info.authors.author" is a LIST when there are several authors but a single OBJECT
 *     when there is only one
 *   - people who share a name carry a four-digit number ("Wei Wang 0001")
 *   - titles end with a full stop and may hold HTML entities ("&amp;")
 *   - when nothing is found, "hits" has no "hit" key at all (see dblpEmptyResponse)
 *
 * The same object is used in two places:
 *   1. tests/newProviders.test.js feeds it to a stubbed fetch, so the real mapping code runs.
 *   2. services/providers/dblp.js reads it when OFFLINE_MODE=true, so the deterministic
 *      test run gets DBLP records without touching the network.
 *
 * Each hit is there to exercise one thing:
 *   [0] a journal article with every field filled in, three authors (one with a homonym
 *       number), an upper-case DOI and closed access
 *   [1] a conference paper with ONE author sent as a single object, HTML entities in the
 *       title, open access
 *   [2] an arXiv preprint ("Informal and Other Publications", venue CoRR) whose "ee" link
 *       is an arXiv page, with no DOI
 *   [3] a doctoral thesis ("Books and Theses" with a key that starts with "phd/"), a single
 *       author with a homonym number
 *   [4] an edited volume with nearly everything missing or odd: no authors, no year, the
 *       venue and the "ee" link sent as lists, an access value we do not know
 *   [5] a hit with no title at all (the adapter must skip it)
 *   [6] a book chapter whose title ends with a question mark (which must be kept), with a
 *       DOI only inside the "ee" link
 *   [7] a book ("Books and Theses" with a key that starts with "books/")
 */

const dblpSearchPublResponse = {
  result: {
    query: 'deep* learn*',
    status: { '@code': '200', text: 'OK' },
    time: { '@unit': 'msecs', text: '12.34' },
    completions: { '@total': '0', '@computed': '0', '@sent': '0' },
    hits: {
      '@total': '8',
      '@computed': '8',
      '@sent': '8',
      '@first': '0',
      hit: [
        {
          '@score': '6',
          '@id': '1000001',
          info: {
            authors: {
              author: [
                { '@pid': '00/0001-1', text: 'Wei Wang 0001' },
                { '@pid': '00/0002', text: 'Nusrat Jahan' },
                { '@pid': '00/0003', text: 'Per-Olof Lindqvist' },
              ],
            },
            title: 'Deep Learning for Flood Forecasting in River Deltas.',
            venue: 'J. Example Mach. Learn. Res.',
            volume: '22',
            number: '3',
            pages: '101-128',
            year: '2021',
            type: 'Journal Articles',
            access: 'closed',
            key: 'journals/jemlr/WangJL21',
            doi: '10.5555/DBLP.Fixture.0001',
            ee: 'https://doi.org/10.5555/DBLP.Fixture.0001',
            url: 'https://dblp.org/rec/journals/jemlr/WangJL21',
          },
          url: 'URL#1000001',
        },
        {
          '@score': '5',
          '@id': '1000002',
          info: {
            authors: { author: { '@pid': '00/0004', text: 'Chidinma O&apos;Brien' } },
            title: 'Deep Learning &amp; Search: Ranking &quot;Hard&quot; Queries at Scale.',
            venue: 'EXCONF',
            pages: '55-64',
            year: '2019',
            type: 'Conference and Workshop Papers',
            access: 'open',
            key: 'conf/exconf/OBrien19',
            doi: '10.5555/dblp.fixture.0002',
            ee: 'https://doi.org/10.5555/dblp.fixture.0002',
            url: 'https://dblp.org/rec/conf/exconf/OBrien19',
          },
          url: 'URL#1000002',
        },
        {
          '@score': '5',
          '@id': '1000003',
          info: {
            authors: {
              author: [
                { '@pid': '00/0005', text: 'Mariam Sultana' },
                { '@pid': '00/0006-2', text: 'Li Zhang 0002' },
              ],
            },
            title: 'Deep Learning Models that Explain Themselves.',
            venue: 'CoRR',
            volume: 'abs/2000.00001',
            year: '2020',
            type: 'Informal and Other Publications',
            access: 'open',
            key: 'journals/corr/abs-2000-00001',
            ee: 'https://arxiv.org/abs/2000.00001',
            url: 'https://dblp.org/rec/journals/corr/abs-2000-00001',
          },
          url: 'URL#1000003',
        },
        {
          '@score': '4',
          '@id': '1000004',
          info: {
            authors: { author: { '@pid': '00/0007-3', text: 'Farhana Rahman 0003' } },
            title: 'Deep Learning Methods for Low-Resource Speech Recognition.',
            year: '2018',
            type: 'Books and Theses',
            access: 'open',
            key: 'phd/us/Rahman18',
            ee: 'https://repository.example.edu/handle/1234/9876',
            url: 'https://dblp.org/rec/phd/us/Rahman18',
          },
          url: 'URL#1000004',
        },
        {
          '@score': '3',
          '@id': '1000005',
          info: {
            title: '  Deep Learning in Practice - Proceedings of the Example Workshop  ',
            venue: ['EXWS', 'Example Lecture Notes'],
            type: 'Editorship',
            access: 'unavailable',
            key: 'conf/exws/2017',
            ee: ['https://proceedings.example.org/exws2017/', 'https://mirror.example.org/exws2017/'],
            url: 'https://dblp.org/rec/conf/exws/2017',
          },
          url: 'URL#1000005',
        },
        {
          '@score': '3',
          '@id': '1000006',
          info: {
            authors: { author: { '@pid': '00/0008', text: 'Nobody Atall' } },
            year: '2016',
            type: 'Journal Articles',
            key: 'journals/ex/Atall16',
            url: 'https://dblp.org/rec/journals/ex/Atall16',
          },
          url: 'URL#1000006',
        },
        {
          '@score': '2',
          '@id': '1000007',
          info: {
            authors: {
              author: [
                { '@pid': '00/0009', text: 'Lucía García Márquez' },
                { '@pid': '00/0010', text: 'Tanvir Ahmed' },
              ],
            },
            title: 'Is Deep Learning Enough for Reasoning?',
            venue: 'Example Handbook of Machine Reasoning',
            pages: '201-230',
            year: '2015',
            type: 'Parts in Books or Collections',
            access: 'closed',
            key: 'books/ex/15/GarciaA15',
            ee: 'https://doi.org/10.5555/DBLP.Fixture.0007',
            url: 'https://dblp.org/rec/books/ex/15/GarciaA15',
          },
          url: 'URL#1000007',
        },
        {
          '@score': '1',
          '@id': '1000008',
          info: {
            authors: { author: [{ '@pid': '00/0011', text: 'Anwar Hossain' }] },
            title: 'Deep Learning Foundations.',
            publisher: 'Example Academic Press',
            year: '2014',
            type: 'Books and Theses',
            access: 'closed',
            key: 'books/ex/Hossain14',
            ee: 'https://www.example-press.org/books/deep-learning-foundations',
            url: 'https://dblp.org/rec/books/ex/Hossain14',
          },
          url: 'URL#1000008',
        },
      ],
    },
  },
};

// What DBLP sends when nothing matches: the "hit" key is simply not there.
const dblpEmptyResponse = {
  result: {
    query: 'zzzznothingmatches*',
    status: { '@code': '200', text: 'OK' },
    time: { '@unit': 'msecs', text: '1.02' },
    completions: { '@total': '0', '@computed': '0', '@sent': '0' },
    hits: { '@total': '0', '@computed': '0', '@sent': '0', '@first': '0' },
  },
};

module.exports = { dblpSearchPublResponse, dblpEmptyResponse };
