#!/usr/bin/env python3
"""
Builds the small PDF fixtures used by tests/fullText.test.js.

Run once from this folder (needs the Python package "reportlab"):

    python3 generate_fixtures.py

The PDFs are committed next to this script, so the tests never need Python.
Every paper below is invented for testing; none of it is a real publication.
The files are built with invariant=1 so running the script again gives the same bytes.

What each file is for:
  ieee_two_column.pdf   two-column conference paper, roman-numeral headings in small caps,
                        "VI. LIMITATIONS", "VII. CONCLUSION AND FUTURE WORK", a data sentence with
                        a Zenodo DOI and a GitHub link broken across two lines, a table and a figure
                        caption, and a reference list that contains somebody else's GitHub link
  thesis.pdf            thesis: title page, contents page with dot leaders, running header, page
                        numbers, "Chapter 5" / "Conclusion", "5.2 Limitations" (which continues over a
                        page break), "5.3 Future Work", a word hyphenated across two lines,
                        references, appendix
  discussion_only.pdf   paper with no Limitations heading; the limitations are sentences inside
                        "4 Discussion" and the future work is a sentence inside "5 Conclusion"
  no_key_sections.pdf   short paper with none of the wanted sections (the reader must return nulls)
  image_only.pdf        scanned-style PDF: two pages holding only a picture, no text layer
  long_thesis.pdf       90 thin pages with bookmarks: the conclusion chapter sits on pages 68-70,
                        outside "first 60 pages + last 15 pages"; every filler page has its own
                        words, as the pages of a real thesis do
  encrypted.pdf         needs a password to open
  login_page.html       what a publisher sends instead of a PDF when you are not signed in

One more fixture is NOT built by this script: latex_two_column.pdf is typeset with pdflatex from
latex_two_column.tex (see the top of that file), so that the reader is also tested against the
output of the program most real papers are made with.
"""

import os

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.lib.pagesizes import A4, letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfgen import canvas
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    FrameBreak,
    NextPageTemplate,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

HERE = os.path.dirname(os.path.abspath(__file__))


def out(name):
    return os.path.join(HERE, name)


# ---------------------------------------------------------------------------
# (a) Two-column IEEE-style paper
# ---------------------------------------------------------------------------

def build_ieee():
    page_w, page_h = letter
    margin_x, margin_top, margin_bottom, gutter = 48, 54, 54, 18
    col_w = (page_w - 2 * margin_x - gutter) / 2

    body = ParagraphStyle('body', fontName='Times-Roman', fontSize=10, leading=12,
                          alignment=TA_JUSTIFY, firstLineIndent=10)
    abstract = ParagraphStyle('abstract', parent=body, fontName='Times-Bold', fontSize=9, leading=11)
    heading = ParagraphStyle('heading', fontName='Times-Roman', fontSize=10, leading=12,
                             alignment=TA_CENTER, spaceBefore=9, spaceAfter=4)
    subheading = ParagraphStyle('subheading', fontName='Times-Italic', fontSize=10, leading=12,
                                spaceBefore=6, spaceAfter=3)
    caption = ParagraphStyle('caption', fontName='Times-Roman', fontSize=8, leading=10,
                             alignment=TA_CENTER, spaceBefore=4, spaceAfter=4)
    figcaption = ParagraphStyle('figcaption', fontName='Times-Roman', fontSize=8, leading=10,
                                spaceBefore=4, spaceAfter=6)
    ref = ParagraphStyle('ref', fontName='Times-Roman', fontSize=8, leading=9.6,
                         leftIndent=16, firstLineIndent=-16, alignment=TA_JUSTIFY)
    title = ParagraphStyle('title', fontName='Times-Roman', fontSize=22, leading=26, alignment=TA_CENTER)
    authors = ParagraphStyle('authors', fontName='Times-Roman', fontSize=11, leading=14, alignment=TA_CENTER)

    def small_caps(number, word):
        # IEEE headings are small capitals: a full-size first letter, the rest two points smaller.
        return Paragraph('%s <font size="10">%s</font><font size="8">%s</font>' % (number, word[0], word[1:]), heading)

    def small_caps_words(number, words):
        parts = ['<font size="10">%s</font><font size="8">%s</font>' % (w[0], w[1:]) for w in words.split(' ')]
        return Paragraph('%s %s' % (number, ' '.join(parts)), heading)

    story = []
    story.append(Paragraph('Lightweight Crop Disease Recognition on Low-Cost Phones for Smallholder Farms', title))
    story.append(Spacer(1, 8))
    story.append(Paragraph('Farhana Rahman, Tomas Lindqvist, and Ayesha Karim', authors))
    story.append(Paragraph('<i>Department of Computer Science, Riverside Institute of Technology</i>', authors))
    story.append(Spacer(1, 14))
    story.append(NextPageTemplate('two'))
    story.append(FrameBreak())

    story.append(Paragraph(
        '<i>Abstract</i>—Smallholder farmers rarely have access to an agronomist when a crop disease '
        'appears. We present a compact convolutional network that recognises twelve rice and jute leaf '
        'diseases directly on a low-cost phone. The network is trained on 18,400 field photographs and '
        'reaches 93.1% accuracy while running in 41 ms per image without a network connection.', abstract))
    story.append(Paragraph(
        '<i>Index Terms</i>—crop disease, mobile inference, convolutional networks, agriculture.', abstract))

    story.append(small_caps('I.', 'INTRODUCTION'))
    story.append(Paragraph(
        'Rice and jute are the two crops that most smallholder families in the delta depend on. Leaf '
        'diseases such as blast, brown spot and stem rot can remove a third of a harvest when they are '
        'noticed late. Extension officers are few, and a farmer may wait a week before somebody who can '
        'name the disease visits the field.', body))
    story.append(Paragraph(
        'Phones with a camera are now common even in remote villages. This makes automatic recognition '
        'from a photograph attractive, but most published models are too large for the phones that '
        'farmers actually own, and they assume a fast connection to a server. Our goal is a model that '
        'fits in 6 MB and gives an answer on the device itself.', body))
    story.append(Paragraph(
        'The contributions of this paper are: a field dataset collected over two growing seasons, a '
        'compact network designed for phones with 2 GB of memory, and a study with 64 farmers who used '
        'the application for one season.', body))

    story.append(small_caps_words('II.', 'RELATED WORK'))
    story.append(Paragraph(
        'Early systems classified leaf images taken under laboratory lighting [1]. Their accuracy falls '
        'sharply on field photographs, where leaves overlap and the background is soil or water [2]. '
        'Later work fine-tuned large image networks [3], which improved accuracy but produced models of '
        'several hundred megabytes. Pruning and quantisation reduce the size [4], yet few studies report '
        'timings on the inexpensive handsets common in rural markets.', body))

    story.append(small_caps('III.', 'METHODOLOGY'))
    story.append(Paragraph('<i>A. Data Collection</i>', subheading))
    story.append(Paragraph(
        'Photographs were taken by eleven trained volunteers in 37 villages between June 2021 and '
        'November 2022. Each photograph was labelled independently by two plant pathologists, and a '
        'third resolved disagreements. After removing blurred images the dataset holds 18,400 '
        'photographs in twelve disease classes and one healthy class.', body))
    story.append(Paragraph('<i>B. Network Design</i>', subheading))
    story.append(Paragraph(
        'The network uses depthwise separable convolutions with a width multiplier of 0.5. We replace '
        'the final pooling layer with an attention block that weighs leaf regions more than background. '
        'Weights are quantised to eight bits after training. The final model occupies 5.7 MB.', body))

    table = Table(
        [['Model', 'Size (MB)', 'Accuracy'],
         ['ResNet-50', '98', '94.0'],
         ['MobileNetV2', '14', '91.2'],
         ['EfficientNet-B0', '21', '92.6'],
         ['Ours', '5.7', '93.1']],
        colWidths=[col_w * 0.44, col_w * 0.28, col_w * 0.28])
    table.setStyle(TableStyle([
        ('FONT', (0, 0), (-1, -1), 'Times-Roman', 8),
        ('LINEABOVE', (0, 0), (-1, 0), 0.6, colors.black),
        ('LINEBELOW', (0, 0), (-1, 0), 0.4, colors.black),
        ('LINEBELOW', (0, -1), (-1, -1), 0.6, colors.black),
        ('ALIGN', (1, 0), (-1, -1), 'CENTER'),
        ('TOPPADDING', (0, 0), (-1, -1), 1.5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 1.5),
    ]))
    story.append(Paragraph('TABLE I', caption))
    story.append(Paragraph('<font size="8">C</font><font size="6.5">OMPARISON OF MODELS ON THE FIELD TEST SET</font>', caption))
    story.append(table)
    story.append(Spacer(1, 6))

    story.append(small_caps('IV.', 'EXPERIMENTS'))
    story.append(Paragraph(
        'We hold out the photographs from seven villages as a test set so that no field appears in both '
        'training and testing. All models are trained for 120 epochs with the same augmentation. '
        'Timings are measured on a phone with a 1.6 GHz processor and 2 GB of memory, averaged over '
        '500 images.', body))
    story.append(Paragraph(
        'Fig. 1. Confusion between brown spot and narrow brown spot accounts for most of the remaining '
        'errors.', figcaption))

    story.append(small_caps_words('V.', 'RESULTS AND DISCUSSION'))
    story.append(Paragraph(
        'Table I compares our network with three common baselines. It is within one point of the '
        'largest model while being seventeen times smaller. On the phone it classifies an image in '
        '41 ms, against 610 ms for ResNet-50. Farmers in the user study reported that an immediate '
        'answer in the field mattered more to them than the last point of accuracy.', body))
    story.append(Paragraph(
        'Accuracy is lowest for the two brown spot diseases, which pathologists also find hard to '
        'separate from a photograph alone. When these two classes are merged, accuracy rises to 95.4%.', body))

    story.append(small_caps('VI.', 'LIMITATIONS'))
    story.append(Paragraph(
        'Our study has several limitations. First, all photographs come from a single river delta, so '
        'the model may not transfer to regions with different rice varieties or soil colour. Second, '
        'the dataset contains few images of early-stage infection, because farmers usually report a '
        'disease only after it has spread. Third, the user study lasted one growing season and '
        'involved 64 farmers, which is too small to measure any effect on yield.', body))
    story.append(Paragraph(
        'Finally, we evaluated a single phone model. Devices with older cameras may produce images on '
        'which the network performs worse than reported here.', body))

    story.append(small_caps_words('VII.', 'CONCLUSION AND FUTURE WORK'))
    story.append(Paragraph(
        'We presented a 5.7 MB network that recognises twelve leaf diseases on a low-cost phone with '
        '93.1% accuracy and no network connection. A season-long study showed that farmers were able '
        'to use it without training.', body))
    story.append(Paragraph(
        'In future work, we plan to collect photographs from two further regions and to add wheat and '
        'maize. We also intend to study whether early warnings change how much pesticide farmers '
        'apply.', body))

    story.append(small_caps_words('', 'DATA AVAILABILITY'))
    story.append(Paragraph(
        'The field photographs and labels that support the findings of this study are openly available '
        'in Zenodo at https://doi.org/10.5281/zenodo.7654321. The training code and the phone '
        'application are available at https://github.com/riverside-agri/leaf-<br/>'
        'doctor-mobile under the MIT licence.', body))

    story.append(small_caps('', 'ACKNOWLEDGMENT'))
    story.append(Paragraph(
        'The authors thank the volunteers who photographed the fields and the farmers who took part in '
        'the study.', body))

    story.append(small_caps('', 'REFERENCES'))
    for text in [
        '[1] S. P. Mohanty, D. P. Hughes, and M. Salathe, "Using deep learning for image-based plant '
        'disease detection," <i>Frontiers in Plant Science</i>, vol. 7, p. 1419, 2016.',
        '[2] K. P. Ferentinos, "Deep learning models for plant disease detection and diagnosis," '
        '<i>Computers and Electronics in Agriculture</i>, vol. 145, pp. 311-318, 2018.',
        '[3] E. C. Too, L. Yujian, S. Njuki, and L. Yingchun, "A comparative study of fine-tuning deep '
        'learning models for plant disease identification," <i>Computers and Electronics in '
        'Agriculture</i>, vol. 161, pp. 272-279, 2019.',
        '[4] A. G. Howard <i>et al.</i>, "MobileNets: Efficient convolutional neural networks for mobile '
        'vision applications," 2017. [Online]. Available: https://github.com/tensorflow/models',
        '[5] D. P. Hughes and M. Salathe, "An open access repository of images on plant health," 2015. '
        '[Online]. Available: https://arxiv.org/abs/1511.08060',
    ]:
        story.append(Paragraph(text, ref))

    def first_page(c, doc):
        c.setFont('Times-Roman', 7)
        c.drawString(margin_x, 24, '978-1-0000-0000-0/23/$31.00 ©2023 Example Conference Society')

    # The title block must be tall enough to hold the title, the authors and the spacer. If it is
    # too short the spacer spills into the left column, the FrameBreak then jumps to the right
    # column, and page 1 ends up with an empty left column, which no real paper looks like.
    title_h = 112
    first_frames = [
        Frame(margin_x, page_h - margin_top - title_h, page_w - 2 * margin_x, title_h, id='title',
              leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0),
        Frame(margin_x, margin_bottom, col_w, page_h - margin_top - margin_bottom - title_h, id='l1',
              leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0),
        Frame(margin_x + col_w + gutter, margin_bottom, col_w, page_h - margin_top - margin_bottom - title_h,
              id='r1', leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0),
    ]
    two_frames = [
        Frame(margin_x, margin_bottom, col_w, page_h - margin_top - margin_bottom, id='l2',
              leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0),
        Frame(margin_x + col_w + gutter, margin_bottom, col_w, page_h - margin_top - margin_bottom, id='r2',
              leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0),
    ]
    doc = BaseDocTemplate(out('ieee_two_column.pdf'), pagesize=letter, invariant=1,
                          title='Lightweight Crop Disease Recognition (test fixture)', author='Test fixture')
    doc.addPageTemplates([
        PageTemplate(id='first', frames=first_frames, onPage=first_page, autoNextPageTemplate='two'),
        PageTemplate(id='two', frames=two_frames),
    ])
    doc.build(story)


# ---------------------------------------------------------------------------
# (b) Thesis
# ---------------------------------------------------------------------------

THESIS_TITLE = 'Flood Early Warning from Low-Cost River Sensors'


def build_thesis():
    page_w, page_h = A4
    margin = 72
    body = ParagraphStyle('tbody', fontName='Times-Roman', fontSize=12, leading=18, alignment=TA_JUSTIFY,
                          spaceAfter=8)
    chapter_no = ParagraphStyle('chapno', fontName='Times-Bold', fontSize=20, leading=26, spaceBefore=40,
                                spaceAfter=6)
    chapter_title = ParagraphStyle('chaptitle', fontName='Times-Bold', fontSize=24, leading=30, spaceAfter=22)
    front_title = ParagraphStyle('front', fontName='Times-Bold', fontSize=18, leading=24, alignment=TA_CENTER,
                                 spaceBefore=20, spaceAfter=18)
    section = ParagraphStyle('tsection', fontName='Times-Bold', fontSize=14, leading=18, spaceBefore=12,
                             spaceAfter=6)
    centre = ParagraphStyle('centre', fontName='Times-Roman', fontSize=14, leading=22, alignment=TA_CENTER)
    big = ParagraphStyle('big', fontName='Times-Bold', fontSize=22, leading=30, alignment=TA_CENTER)
    ref = ParagraphStyle('tref', fontName='Times-Roman', fontSize=11, leading=15, leftIndent=22,
                         firstLineIndent=-22, spaceAfter=6)
    caption = ParagraphStyle('tcaption', fontName='Times-Roman', fontSize=10, leading=13, alignment=TA_CENTER,
                             spaceBefore=4, spaceAfter=10)

    # The page header changes with the chapter, as it does in a real thesis. It is drawn when the
    # page is finished (onPageEnd), so each page shows the chapter that is on it.
    state = {'header': ''}

    class SetHeader(Spacer):
        def __init__(self, text):
            Spacer.__init__(self, 0, 0)
            self.header_text = text

        def draw(self):
            state['header'] = self.header_text

    def on_page(c, doc):
        if doc.page == 1:
            return
        c.setFont('Times-Italic', 9)
        if state['header']:
            c.drawString(margin, page_h - 44, state['header'])
            c.drawRightString(page_w - margin, page_h - 44, THESIS_TITLE)
            c.line(margin, page_h - 48, page_w - margin, page_h - 48)
        c.setFont('Times-Roman', 10)
        c.drawCentredString(page_w / 2, 36, str(doc.page))

    def chapter(number, title_text):
        state_setter = SetHeader('Chapter %d. %s' % (number, title_text))
        return [PageBreak(), state_setter, Paragraph('Chapter %d' % number, chapter_no),
                Paragraph(title_text, chapter_title)]

    story = []
    story.append(Spacer(1, 110))
    story.append(Paragraph(THESIS_TITLE, big))
    story.append(Spacer(1, 40))
    story.append(Paragraph('by', centre))
    story.append(Paragraph('Nusrat Jahan Chowdhury', centre))
    story.append(Spacer(1, 60))
    story.append(Paragraph('A thesis submitted in partial fulfilment of the requirements for the degree of', centre))
    story.append(Paragraph('Master of Science in Computer Science and Engineering', centre))
    story.append(Spacer(1, 60))
    story.append(Paragraph('Department of Computer Science and Engineering', centre))
    story.append(Paragraph('Meghna University', centre))
    story.append(Paragraph('June 2024', centre))

    story.append(PageBreak())
    story.append(SetHeader(''))
    story.append(Paragraph('Abstract', front_title))
    story.append(Paragraph(
        'Flash floods on small rivers give villages little time to move people and livestock. National '
        'gauges are sparse and report every three hours. This thesis studies whether a network of '
        'low-cost ultrasonic sensors, read every five minutes, can give a useful warning for a single '
        'river basin. A gradient boosting model trained on two monsoon seasons of readings predicts '
        'the water level six hours ahead with a mean error of 9.4 cm.', body))

    story.append(PageBreak())
    story.append(Paragraph('Table of Contents', front_title))
    toc_style = ParagraphStyle('toc', fontName='Times-Roman', fontSize=12, leading=18)

    def toc_line(text, page, indent=0):
        # Dot leaders are written out as real characters, the way LaTeX and Word put them in the PDF.
        width_left = page_w - 2 * margin - indent
        from reportlab.pdfbase.pdfmetrics import stringWidth
        used = stringWidth(text + ' ', 'Times-Roman', 12) + stringWidth(' ' + str(page), 'Times-Roman', 12)
        dots = int((width_left - used) / stringWidth('. ', 'Times-Roman', 12)) - 1
        style = ParagraphStyle('toc%d' % indent, parent=toc_style, leftIndent=indent)
        return Paragraph('%s %s %s' % (text, '. ' * dots, page), style)

    toc = [
        ('Abstract', 'ii', 0),
        ('Chapter 1 Introduction', 4, 0),
        ('1.1 Motivation', 4, 18),
        ('1.2 Research Questions', 4, 18),
        ('Chapter 2 Literature Review', 5, 0),
        ('Chapter 3 Methodology', 6, 0),
        ('3.1 Sensor Network', 6, 18),
        ('3.2 Forecasting Model', 6, 18),
        ('Chapter 4 Results', 7, 0),
        ('Chapter 5 Conclusion', 8, 0),
        ('5.1 Summary of Findings', 8, 18),
        ('5.2 Limitations', 8, 18),
        ('5.3 Future Work', 9, 18),
        ('References', 10, 0),
        ('Appendix A Sensor Wiring', 11, 0),
    ]
    for text, page, indent in toc:
        story.append(toc_line(text, page, indent))

    story += chapter(1, 'Introduction')
    story.append(Paragraph('1.1 Motivation', section))
    story.append(Paragraph(
        'In the north-eastern basin, water can rise two metres in a night. Families who live on the '
        'banks rely on shouted warnings from upstream neighbours. The national gauge network has one '
        'station for the whole river, and its readings reach the district office hours after they are '
        'taken. A denser network of inexpensive sensors could close this gap.', body))
    story.append(Paragraph(
        'Commercial river gauges cost several thousand dollars each and need a technician to install '
        'them. In the last decade ultrasonic range finders, small solar panels and mobile modems have '
        'become cheap enough that a complete measuring unit can be built for less than a hundred '
        'dollars. Units of this kind are less accurate than a commercial gauge, but a district can '
        'afford many of them, and many imperfect readings may be worth more than one good reading '
        'that arrives late.', body))
    story.append(Paragraph(
        'A warning is only useful when it reaches people in time to act. Interviews carried out in '
        'four villages before this work began suggested that families need about four hours to move '
        'cattle and stored rice to higher ground. A forecast that looks six hours ahead would '
        'therefore leave a margin of two hours for the message to travel.', body))
    story.append(Paragraph(
        'The river studied here is 94 km long and falls 310 m between the hills and the plain. Its '
        'upper reaches respond to heavy rain within two hours, while the lower reaches, where most '
        'people live, respond more slowly. This delay between upstream and downstream levels is what '
        'makes a forecast from upstream sensors possible at all.', body))
    story.append(Paragraph('1.2 Research Questions', section))
    story.append(Paragraph(
        'This thesis asks how accurately the water level at a village can be predicted six hours ahead '
        'from upstream sensor readings, and how many sensors are needed before additional ones stop '
        'improving the forecast.', body))
    story.append(Paragraph(
        'A third question concerns reliability. Inexpensive sensors fail, lose power and are '
        'occasionally stolen. The thesis therefore also asks how much the forecast degrades when some '
        'of the units are silent, since a warning system that only works when every unit is healthy '
        'would be of little use in the monsoon.', body))

    story += chapter(2, 'Literature Review')
    story.append(Paragraph(
        'Physically based hydrological models describe a basin with equations for rainfall, runoff and '
        'channel flow (Beven, 2012). They need detailed terrain and soil data that are rarely available '
        'for small rivers. Data-driven models learn the relation between upstream and downstream levels '
        'directly from observations (Mosavi et al., 2018). Most published studies use government '
        'gauges; few evaluate sensors that cost less than a hundred dollars each.', body))

    story += chapter(3, 'Methodology')
    story.append(Paragraph('3.1 Sensor Network', section))
    story.append(Paragraph(
        'Fourteen ultrasonic sensors were mounted on bridges along 62 km of the river. Each unit '
        'measures the distance to the water surface every five minutes and sends the reading over the '
        'mobile network. Readings were collected from May 2022 to October 2023.', body))
    story.append(Paragraph('Figure 3.1: Location of the fourteen sensors along the river.', caption))
    story.append(Paragraph('3.2 Forecasting Model', section))
    story.append(Paragraph(
        'A gradient boosting regressor takes the last twelve hours of readings from every upstream '
        'sensor and predicts the level at the target village six hours later. The first season is used '
        'for training and the second for testing.', body))

    story += chapter(4, 'Results')
    story.append(Paragraph(
        'On the second season the model predicts the six-hour level with a mean absolute error of '
        '9.4 cm, compared with 31.7 cm for a persistence baseline. Removing sensors one at a time shows '
        'that eight sensors give almost the same error as fourteen. All eleven events in which the '
        'river crossed the danger mark were predicted at least four hours in advance.', body))
    story.append(Paragraph('Table 4.1: Mean absolute error by forecast horizon.', caption))

    story += chapter(5, 'Conclusion')
    story.append(Paragraph(
        'This chapter summarises what the thesis found, states its limitations and suggests directions '
        'for further study.', body))
    story.append(Paragraph('5.1 Summary of Findings', section))
    story.append(Paragraph(
        'A network of fourteen low-cost sensors, read every five minutes, is enough to predict the '
        'water level at a downstream village six hours ahead with an error below ten centimetres. '
        'Eight well-placed sensors perform almost as well as fourteen, which lowers the cost of a '
        'warning system for a small river to a level that a district council can afford.', body))
    story.append(Paragraph(
        'The forecast remained usable when up to three units were silent, provided that the two units '
        'closest to the hills kept working. This points to a practical rule for anyone who installs '
        'such a network: spend the maintenance budget on the uppermost sensors first.', body))
    story.append(Paragraph(
        'All eleven occasions on which the river crossed the danger mark in the second season were '
        'predicted at least four hours in advance, and the model raised two false alarms. Villagers '
        'who were shown the forecasts said that two false alarms in a season would not stop them '
        'from acting on a warning.', body))
    story.append(Paragraph(
        'Taken together, the results answer the three research questions. The level can be predicted '
        'six hours ahead to within ten centimetres, eight sensors are enough, and the system '
        'tolerates the loss of a few units.', body))
    story.append(Spacer(1, 205))
    story.append(Paragraph('5.2 Limitations', section))
    story.append(Paragraph(
        'The findings rest on two monsoon seasons from one river basin. Neither season contained a '
        'flood as severe as that of 2017, so the behaviour of the model in extreme events is '
        'untested. Sensor outages removed 6% of the readings, and the gaps were filled by interpolation, '
        'which may hide short surges. The results therefore should not be taken as evidence of '
        'general-<br/>ization to rivers with dams or tidal influence.', body))
    story.append(Paragraph('5.3 Future Work', section))
    story.append(Paragraph(
        'Further research should test the approach on at least two other basins and through a season '
        'with a severe flood. Rainfall forecasts from satellite products could be added as inputs to '
        'extend the warning time beyond six hours. A field trial with the district disaster committee '
        'would show whether the warnings change what people actually do.', body))

    story.append(PageBreak())
    story.append(SetHeader('References'))
    story.append(Paragraph('References', front_title))
    for text in [
        'Beven, K. (2012). <i>Rainfall-Runoff Modelling: The Primer</i> (2nd ed.). Wiley-Blackwell.',
        'Mosavi, A., Ozturk, P., and Chau, K. (2018). Flood prediction using machine learning models: '
        'Literature review. <i>Water</i>, 10(11), 1536.',
        'Kratzert, F., Klotz, D., Brenner, C., Schulz, K., and Herrnegger, M. (2018). Rainfall-runoff '
        'modelling using long short-term memory networks. <i>Hydrology and Earth System Sciences</i>, '
        '22, 6005-6022. Code: https://github.com/kratzert/ealstm_regional_modeling',
    ]:
        story.append(Paragraph(text, ref))

    story.append(PageBreak())
    story.append(SetHeader('Appendix A. Sensor Wiring'))
    story.append(Paragraph('Appendix A', chapter_no))
    story.append(Paragraph('Sensor Wiring', chapter_title))
    story.append(Paragraph(
        'Each unit consists of an ultrasonic range finder, a microcontroller with a mobile modem and a '
        'solar panel with a battery. The design files are kept at https://osf.io/q7xk2 for anyone who '
        'wishes to build the sensors.', body))

    doc = BaseDocTemplate(out('thesis.pdf'), pagesize=A4, invariant=1,
                          title=THESIS_TITLE + ' (test fixture)', author='Test fixture')
    frame = Frame(margin, 60, page_w - 2 * margin, page_h - 60 - 64, id='main',
                  leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    doc.addPageTemplates([PageTemplate(id='all', frames=[frame], onPageEnd=on_page)])
    doc.build(story)


# ---------------------------------------------------------------------------
# (c) Limitations only inside "Discussion", (d) nothing to find
# ---------------------------------------------------------------------------

def simple_paper(filename, title_text, author_text, blocks):
    """Single-column paper. blocks is a list of ('h', text) headings and ('p', text) paragraphs."""
    page_w, page_h = A4
    margin = 70
    body = ParagraphStyle('pbody', fontName='Helvetica', fontSize=10, leading=14, alignment=TA_JUSTIFY,
                          spaceAfter=7)
    heading = ParagraphStyle('pheading', fontName='Helvetica-Bold', fontSize=12, leading=16, spaceBefore=10,
                             spaceAfter=5)
    title = ParagraphStyle('ptitle', fontName='Helvetica-Bold', fontSize=17, leading=22, spaceAfter=8)
    author = ParagraphStyle('pauthor', fontName='Helvetica', fontSize=10, leading=14, spaceAfter=14)
    ref = ParagraphStyle('pref', fontName='Helvetica', fontSize=9, leading=12, spaceAfter=3)

    story = [Paragraph(title_text, title), Paragraph(author_text, author)]
    for kind, text in blocks:
        if kind == 'h':
            story.append(Paragraph(text, heading))
        elif kind == 'r':
            story.append(Paragraph(text, ref))
        else:
            story.append(Paragraph(text, body))

    def on_page(c, doc):
        c.setFont('Helvetica', 8)
        c.drawString(margin, page_h - 40, 'Journal of Applied Learning Research 14(2)')
        c.drawRightString(page_w - margin, 34, 'Page %d' % doc.page)

    doc = BaseDocTemplate(out(filename), pagesize=A4, invariant=1, title=title_text + ' (test fixture)',
                          author='Test fixture')
    frame = Frame(margin, 56, page_w - 2 * margin, page_h - 56 - 60, id='main',
                  leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    doc.addPageTemplates([PageTemplate(id='all', frames=[frame], onPage=on_page)])
    doc.build(story)


def build_discussion_only():
    simple_paper('discussion_only.pdf',
                 'Peer Tutoring and First-Year Programming Outcomes',
                 'Imran Hossain and Clara Whitfield',
                 [
        ('h', 'Abstract'),
        ('p', 'Many first-year students fail their first programming course. We examine whether weekly '
              'peer tutoring improves examination results. Among 412 students at one university, those '
              'who attended at least eight sessions scored 7.8 points higher than matched students who '
              'attended none.'),
        ('h', '1 Introduction'),
        ('p', 'Introductory programming has one of the highest failure rates of any first-year course. '
              'Universities have tried smaller classes, automated feedback and peer tutoring, in which '
              'second-year students help first-year students in small groups. Evidence for peer '
              'tutoring comes mostly from small classes in which students chose whether to take part.'),
        ('p', 'This paper compares students who attended tutoring with similar students who did not, '
              'using records from three cohorts.'),
        ('h', '2 Method'),
        ('p', 'We obtained anonymised records for 412 students who took the course between 2020 and '
              '2022. Attendance at tutoring was recorded by the tutors. Each student who attended at '
              'least eight sessions was matched with a student of the same entry grade, gender and '
              'programme who attended none. The outcome is the final examination mark out of 100.'),
        ('h', '3 Results'),
        ('p', 'Students who attended tutoring scored 7.8 points higher on average (95% confidence '
              'interval 4.1 to 11.5). The difference was largest for students with the lowest entry '
              'grades. The pass rate was 81% among attenders and 66% among matched non-attenders.'),
        ('p', 'We did not observe any difference between cohorts taught online and those taught on '
              'campus.'),
        ('h', '4 Discussion'),
        ('p', 'The size of the difference is similar to that reported for supplemental instruction in '
              'mathematics. Tutoring appears to help most the students who arrive least prepared, '
              'which suggests that it narrows rather than widens gaps between students.'),
        ('p', 'These results should be read with care. The main limitation of this study is that '
              'students chose whether to attend, so motivated students may be over-represented among '
              'attenders even after matching. We did not measure prior programming experience, which '
              'could explain part of the difference. The data come from a single university, and we '
              'cannot generalize the findings to institutions with different entry requirements.'),
        ('p', 'Despite this, the pattern was the same in all three cohorts, which makes a chance '
              'finding unlikely.'),
        ('h', '5 Conclusion'),
        ('p', 'Weekly peer tutoring was associated with clearly better examination results in a large '
              'first-year programming course, especially for weaker students. The scheme is cheap to '
              'run because tutors are second-year students.'),
        ('p', 'Further research should assign tutoring places by lottery so that the effect can be '
              'separated from motivation. We plan to follow the 2022 cohort into the second year to '
              'see whether the advantage lasts.'),
        ('h', 'References'),
        ('r', 'Bennedsen, J. and Caspersen, M. (2019). Failure rates in introductory programming: 12 '
              'years later. ACM Inroads, 10(2), 30-36.'),
        ('r', 'Dawson, P., van der Meer, J., Skalicky, J. and Cowley, K. (2014). On the effectiveness '
              'of supplemental instruction. Review of Educational Research, 84(4), 609-639.'),
    ])


def build_no_key_sections():
    simple_paper('no_key_sections.pdf',
                 'A Note on Rainfall Records from Three Hill Stations',
                 'Devika Menon',
                 [
        ('h', 'Abstract'),
        ('p', 'We describe daily rainfall records kept at three hill stations between 1961 and 2010 '
              'and report simple statistics for each decade.'),
        ('h', 'Introduction'),
        ('p', 'Long rainfall records from hill stations are scarce. The three stations described here '
              'were run by tea estates, whose managers wrote the daily total in a ledger each morning. '
              'The ledgers were typed into spreadsheets by the author during 2021.'),
        ('h', 'Data and Methods'),
        ('p', 'Each station used a standard 203 mm gauge read at 08:30 local time. Days on which the '
              'ledger entry was illegible were marked as missing; they make up 1.2% of all days. '
              'Decadal means were computed from complete years only.'),
        ('h', 'Results'),
        ('p', 'Mean annual rainfall was 2,610 mm, 3,140 mm and 2,275 mm at the three stations. The '
              'wettest decade at all three was 1981 to 1990. The number of days with more than 100 mm '
              'rose from 3.1 per year in the 1960s to 4.6 per year in the 2000s.'),
        ('p', 'The monsoon months of June to September account for 71% of the annual total at the '
              'wettest station and 64% at the driest.'),
        ('h', 'References'),
        ('r', 'Guhathakurta, P. and Rajeevan, M. (2008). Trends in the rainfall pattern over India. '
              'International Journal of Climatology, 28, 1453-1469.'),
    ])


# ---------------------------------------------------------------------------
# (e) Image-only PDF, long thesis with bookmarks, password-protected PDF
# ---------------------------------------------------------------------------

def build_image_only():
    from reportlab.lib.utils import ImageReader
    from PIL import Image, ImageDraw

    c = canvas.Canvas(out('image_only.pdf'), pagesize=A4, invariant=1)
    c.setTitle('Scanned pages (test fixture)')
    for page in range(2):
        # A grey "scan" with darker bars where the lines of text would be: pixels only, no text.
        img = Image.new('L', (300, 424), 236)
        draw = ImageDraw.Draw(img)
        for row in range(14):
            y = 40 + row * 26 + page * 3
            draw.rectangle([34, y, 266 - (row * 37 % 90), y + 9], fill=70)
        c.drawImage(ImageReader(img), 0, 0, width=A4[0], height=A4[1])
        c.showPage()
    c.save()


def build_long_thesis():
    """
    90 pages with very little on each, so the file stays small. What matters is the layout:
    the conclusion chapter is on pages 68-70, references on 71-76 and appendices on 77-90,
    so "first 60 pages + last 15" misses the conclusion. The PDF carries bookmarks.
    """
    page_w, page_h = A4
    c = canvas.Canvas(out('long_thesis.pdf'), pagesize=A4, invariant=1)
    c.setTitle('Long thesis with bookmarks (test fixture)')

    def footer(n):
        c.setFont('Times-Roman', 10)
        c.drawCentredString(page_w / 2, 36, str(n))

    # Every filler page gets its own words. Identical lines at the top of every page would look
    # like a running header to the reader and be removed, which no real thesis would cause.
    places = ['north gate', 'river bridge', 'bus depot', 'old market', 'school yard', 'ring road', 'rail yard',
              'east park', 'harbour wall', 'town hall']
    weather = ['calm', 'windy', 'foggy', 'humid', 'dry', 'rainy', 'cold', 'mild', 'dusty']

    def filler(n, label):
        place = places[n % len(places)]
        sky = weather[n % len(weather)]
        c.setFont('Times-Roman', 12)
        y = page_h - 100
        for line in [
            'The %s sensor was visited on a %s morning in week %d of the campaign, and the' % (place, sky, n),
            'filters were changed before the %s readings of that visit were written down.' % sky,
            'Notes kept at the %s on that %s day belong to %s of the logbook.' % (place, sky, label.lower()),
        ]:
            c.drawString(72, y, line)
            y -= 18
        footer(n)

    def heading(text, y, size=20):
        c.setFont('Times-Bold', size)
        c.drawString(72, y, text)

    def para(lines, y):
        c.setFont('Times-Roman', 12)
        for line in lines:
            c.drawString(72, y, line)
            y -= 18
        return y

    chapters = {1: ('Chapter 1', 'Introduction'), 12: ('Chapter 2', 'Background'),
                30: ('Chapter 3', 'System Design'), 48: ('Chapter 4', 'Evaluation')}
    for n in range(1, 91):
        if n in chapters:
            number, name = chapters[n]
            c.bookmarkPage('p%d' % n)
            c.addOutlineEntry('%s %s' % (number, name), 'p%d' % n, level=0)
            heading(number, page_h - 110, 18)
            heading(name, page_h - 140, 22)
            para(['This chapter, %s, opens a new part of the work and explains how it is organised.' % name.lower()],
                 page_h - 180)
            footer(n)
        elif n == 68:
            c.bookmarkPage('p68')
            c.addOutlineEntry('Chapter 5 Conclusions and Future Work', 'p68', level=0)
            heading('Chapter 5', page_h - 110, 18)
            heading('Conclusions and Future Work', page_h - 140, 22)
            y = para([
                'The monitoring system built in this thesis ran unattended for fourteen months and',
                'recorded air quality at nine sites with less than two percent of readings lost.',
                'Its measurements agreed with the reference station to within eight percent.',
            ], page_h - 180)
            footer(n)
        elif n == 69:
            c.bookmarkPage('p69')
            c.addOutlineEntry('5.1 Limitations', 'p69', level=1)
            heading('5.1 Limitations', page_h - 100, 14)
            para([
                'The sensors were calibrated against a single reference station, so drift at the',
                'other sites could not be checked. The study covered one city and one winter.',
            ], page_h - 126)
            footer(n)
        elif n == 70:
            c.bookmarkPage('p70')
            c.addOutlineEntry('5.2 Future Work', 'p70', level=1)
            heading('5.2 Future Work', page_h - 100, 14)
            para([
                'Future work should add a second reference station and run the network through a',
                'full year so that seasonal drift can be measured.',
            ], page_h - 126)
            footer(n)
        elif n == 71:
            c.bookmarkPage('p71')
            c.addOutlineEntry('References', 'p71', level=0)
            heading('References', page_h - 110, 20)
            para(['[1] Castell, N. et al. (2017). Can commercial low-cost sensor platforms contribute',
                  'to air quality monitoring? Environment International, 99, 293-302.'], page_h - 150)
            footer(n)
        elif 72 <= n <= 76:
            para(['[%d] Author, A. and Author, B. (20%02d). A study of urban air quality sensors.' % (n - 60, n - 60),
                  'Journal of Environmental Monitoring, %d, 100-110.' % n], page_h - 100)
            footer(n)
        elif n == 77:
            c.bookmarkPage('p77')
            c.addOutlineEntry('Appendix A Calibration Tables', 'p77', level=0)
            heading('Appendix A', page_h - 110, 18)
            heading('Calibration Tables', page_h - 140, 22)
            footer(n)
        else:
            label = 'Appendix A' if n > 77 else 'Section %d' % ((n // 6) + 1)
            filler(n, label)
        c.showPage()
    c.save()


def build_encrypted():
    c = canvas.Canvas(out('encrypted.pdf'), pagesize=A4, invariant=1,
                      encrypt=__import__('reportlab.lib.pdfencrypt', fromlist=['StandardEncryption'])
                      .StandardEncryption('reader-needs-this', ownerPassword='owner-only', strength=40))
    c.setFont('Times-Roman', 12)
    c.drawString(72, 760, 'This page can only be read with the password.')
    c.showPage()
    c.save()


def build_login_page():
    html = """<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Sign in to continue</title></head>
<body>
  <h1>Institutional sign in</h1>
  <p>You need to sign in to download this article as a PDF.</p>
  <form method="post" action="/login"><input name="user"><input name="password" type="password"></form>
</body>
</html>
"""
    with open(out('login_page.html'), 'w', newline='\n') as handle:
        handle.write(html)


if __name__ == '__main__':
    build_ieee()
    build_thesis()
    build_discussion_only()
    build_no_key_sections()
    build_image_only()
    build_long_thesis()
    build_encrypted()
    build_login_page()
    for name in sorted(os.listdir(HERE)):
        print('%8d  %s' % (os.path.getsize(os.path.join(HERE, name)), name))
