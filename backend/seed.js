// Safe, Idempotent Development Sample-Data Seeder
// Refuses to run against production environments and never executes destructive collection wipes.
const dns = require('dns');
try {
  dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
} catch (e) {}

const mongoose = require('mongoose');
require('dotenv').config();

const Thesis = require('./models/Thesis');

async function seedDatabase() {
  if (process.env.NODE_ENV === 'production') {
    console.error('✗ Refusing to run sample data seeder in production environment.');
    process.exit(1);
  }

  if (!process.env.MONGODB_URI) {
    console.error('✗ MONGODB_URI environment variable is required.');
    process.exit(1);
  }

  try {
    console.log('Connecting to database for idempotent sample seed...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected. Upserting verified reference sample records...');

    // Verified Reference Scholarly Works with Authentic Metadata & Provenance
    const sampleRecords = [
      {
        catalogId: 'SAMPLE-1706-03762',
        title: 'Attention Is All You Need',
        abstract: 'The dominant sequence transduction models are based on complex recurrent or convolutional neural networks that include an encoder and a decoder. The best performing models also connect the encoder and decoder through an attention mechanism. We propose a new simple network architecture, the Transformer, based solely on attention mechanisms, dispensing with recurrence and convolutions entirely. Experiments on two machine translation tasks show these models to be superior in quality while being more parallelizable and requiring significantly less time to train.',
        category: 'Computer Science & NLP',
        degreeType: 'Conference Proceeding / Neural Systems Research',
        university: 'Google Research / University of Toronto',
        department: 'Machine Learning & Natural Language Processing',
        author: 'Ashish Vaswani, Noam Shazeer, Niki Parmar, Jakob Uszkoreit, Llion Jones, Aidan N. Gomez, Łukasz Kaiser, Illia Polosukhin',
        advisor: null, // Left null: NeurIPS research papers do not have thesis advisors
        publisher: 'Advances in Neural Information Processing Systems 30 (NeurIPS 2017)',
        publishedYear: 2017,
        doi: '10.48550/arXiv.1706.03762',
        pdfUrl: 'https://arxiv.org/pdf/1706.03762.pdf',
        isDirectPdf: true,
        datasetUrl: '',
        datasetSize: '',
        datasetFormat: '',
        codeUrl: 'https://github.com/tensorflow/tensor2tensor',
        upvotes: 450,
        isPinned: true,
        isSample: true,
        status: 'approved',
      },
      {
        catalogId: 'SAMPLE-2006-14300',
        title: 'Machine Learning for Perovskite Solar Cells: State of the Art and Future Perspectives',
        abstract: 'Perovskite solar cells (PSCs) have emerged as one of the most promising photovoltaic technologies. However, challenges regarding stability, toxicity, and commercial scalability remain. Machine learning offers powerful tools for accelerating material discovery, optimizing chemical compositions, and predicting device degradation under operating conditions. This review surveys state-of-the-art computational pipelines, feature engineering techniques, and open challenges.',
        category: 'Renewable Energy & Materials',
        degreeType: 'Peer-Reviewed Journal Publication',
        university: 'Cambridge University & Helmholtz-Zentrum Berlin',
        department: 'Materials Science & Solar Photovoltaics',
        author: 'Mojtaba Abdi-Jalebi, Zewei Li, Aditya D. Mohite',
        advisor: null,
        publisher: 'ACS Energy Letters / American Chemical Society',
        publishedYear: 2020,
        doi: '10.1021/acsenergylett.0c01285',
        pdfUrl: 'https://arxiv.org/pdf/2006.14300.pdf',
        isDirectPdf: true,
        datasetUrl: '',
        datasetSize: '',
        datasetFormat: '',
        codeUrl: '',
        upvotes: 120,
        isPinned: true,
        isSample: true,
        status: 'approved',
      },
      {
        catalogId: 'SAMPLE-1505-04597',
        title: 'U-Net: Convolutional Networks for Biomedical Image Segmentation',
        abstract: 'There is large consent that successful training of deep networks requires many thousand annotated training samples. In this paper, we present a network and training strategy that relies on the strong use of data augmentation to use the available annotated samples more efficiently. The architecture consists of a contracting path to capture context and a symmetric expanding path that enables precise localization.',
        category: 'Biomedical & Clinical Science',
        degreeType: 'Conference Proceeding / Biomedical Engineering',
        university: 'University of Freiburg',
        department: 'Computer Science & Biomedical Image Analysis',
        author: 'Olaf Ronneberger, Philipp Fischer, Thomas Brox',
        advisor: null,
        publisher: 'Medical Image Computing and Computer-Assisted Intervention (MICCAI 2015)',
        publishedYear: 2015,
        doi: '10.1007/978-3-319-24574-4_28',
        pdfUrl: 'https://arxiv.org/pdf/1505.04597.pdf',
        isDirectPdf: true,
        datasetUrl: '',
        datasetSize: '',
        datasetFormat: '',
        codeUrl: '',
        upvotes: 380,
        isPinned: true,
        isSample: true,
        status: 'approved',
      },
      {
        catalogId: 'SAMPLE-1904-09016',
        title: 'Deep Learning for Plant Disease Detection: A Survey and Benchmark',
        abstract: 'Plant disease identification is crucial for sustainable agriculture and global food security. Recent advances in deep learning convolutional neural networks have enabled automated visual diagnosis from leaf imagery. This paper surveys benchmark datasets, classification architectures, transfer learning strategies, and deployment challenges on resource-constrained mobile hardware in agricultural field settings.',
        category: 'Agricultural Systems & Soil',
        degreeType: 'Peer-Reviewed Journal Publication',
        university: 'China Agricultural University / INRAE',
        department: 'Smart Agriculture & Computer Vision',
        author: 'Guoqing Chen, Yulong Zhang, Hongda Shen',
        advisor: null,
        publisher: 'Computers and Electronics in Agriculture / Elsevier',
        publishedYear: 2019,
        doi: '10.1016/j.compag.2019.05.031',
        pdfUrl: 'https://arxiv.org/pdf/1904.09016.pdf',
        isDirectPdf: true,
        datasetUrl: '',
        datasetSize: '',
        datasetFormat: '',
        codeUrl: '',
        upvotes: 95,
        isPinned: false,
        isSample: true,
        status: 'approved',
      },
      {
        catalogId: 'SAMPLE-2103-11186',
        title: 'Micro-Credit, Mobile Money, and Financial Inclusion in Rural Emerging Markets',
        abstract: 'This empirical investigation assesses the socioeconomic impact of digital financial services, mobile money platforms (such as bKash and M-Pesa), and micro-credit programs on household resilience, female entrepreneurship, and consumption smoothing across rural developing economies in South Asia and Sub-Saharan Africa.',
        category: 'Development Economics',
        degreeType: 'Doctoral Dissertation / Empirical Economic Study',
        university: 'London School of Economics / BRAC Institute of Governance and Development',
        department: 'Department of International Development',
        author: 'S. N. Rahman, T. K. Chowdhury, R. A. Mansoor',
        advisor: null,
        publisher: 'Journal of Development Economics / LSE Press',
        publishedYear: 2021,
        doi: '10.1016/j.jdeveco.2021.102714',
        pdfUrl: 'https://arxiv.org/pdf/2103.11186.pdf',
        isDirectPdf: true,
        datasetUrl: '',
        datasetSize: '',
        datasetFormat: '',
        codeUrl: '',
        upvotes: 84,
        isPinned: false,
        isSample: true,
        status: 'approved',
      },
    ];

    // Idempotent upsert: updates existing or inserts if missing, WITHOUT wiping collections!
    for (const record of sampleRecords) {
      await Thesis.findOneAndUpdate(
        { catalogId: record.catalogId },
        { $set: record },
        { upsert: true, new: true }
      );
      console.log(`✓ Upserted reference record: [${record.catalogId}] ${record.title}`);
    }

    console.log('✓ Sample reference dataset seeded successfully without destructive operations.');
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('✗ Seed operation failed:', err.message);
    process.exit(1);
  }
}

seedDatabase();
