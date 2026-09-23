# Статья для технического перевода (ИСППР)

## Выбранная статья

**Design Knowledge for Deep-Learning-Enabled Image-Based Decision Support Systems: Evidence From Power Line Maintenance Decision-Making**

- **Авторы:** Julius Peter Landwehr, Niklas Kühl, Jannis Walk (Karlsruhe Institute of Technology, Германия); Mario Gnädig (Netze BW GmbH, Штутгарт, Германия)
- **Журнал:** Business & Information Systems Engineering (Springer), 2022, Vol. 64, Issue 6, pp. 707–728
- **Тип:** Research Paper (научная статья)
- **Опубликована:** 1 апреля 2022 г. (получена 6.11.2020, принята 15.12.2021)
- **DOI:** [10.1007/s12599-022-00745-z](https://doi.org/10.1007/s12599-022-00745-z)
- **Доступ:** открытый (лицензия CC BY 4.0): [Springer](https://link.springer.com/article/10.1007/s12599-022-00745-z) · [PubMed Central](https://pmc.ncbi.nlm.nih.gov/articles/PMC8973684/)
- **Keywords:** Decision support system; Design science research; Computer vision; Infrastructure inspection and maintenance; Power line; Deep learning

Файлы в этой папке:

- `Landwehr_2022_BISE_original.pdf`: оригинал статьи (издательский PDF, 22 с.), его и нужно распечатать;
- `Landwehr_2022_BISE_fragment_highlighted.pdf`: та же статья, фрагмент для перевода выделен жёлтым (с. 711–713).

## Соответствие требованиям задания

| Требование | Статья |
|---|---|
| Научная статья (не монография, не диссертация, не учебник) | Research Paper в рецензируемом журнале Springer |
| Заголовок, выходные данные, аннотация, ключевые слова, список литературы | Всё есть (Abstract, Keywords, References) |
| Не старше 10 лет | 2022 г. |
| Зарубежные авторы (не РФ и не страны СНГ) | Германия (Западная Европа) |
| По специальности ИСППР | Проектирование интеллектуальной СППР (DSS) на основе глубокого обучения и компьютерного зрения |
| Фрагмент не из аннотации, выходных данных, заключения, списка литературы | Разделы 2.4–4 (обзор, методология, концептуализация) |
| Сплошной текст без пропусков | Да, от заголовка 2.4 до конца вводного абзаца раздела 4 (перед 4.1) |

## Фрагмент для перевода

- **Расположение:** с. 711 (правая колонка, раздел **2.4 Image-Based Decision Support Systems**) по с. 713 (конец вводного абзаца раздела **4 Application Case and Conceptualization**, перед подразделом 4.1).
- **Начало:** «The access to increasing volumes of images…»
- **Конец:** «…which then serve as a basis for deriving the DPs.»
- **Объём (без пробелов):**
  - **5 920 знаков**, если считать заголовки подразделов и ссылки в скобках (сверено по PDF: ≈5 910);
  - 5 802 знака без заголовков подразделов;
  - ≈5 554 знака без библиографических ссылок в скобках, например «(Hevner et al. 2004)»;
  - для справки: 6 965 знаков с пробелами, ≈1 057 слов.
- Формул нет. Рисунок 1 и подпись к нему (с. 712) в объём не входят и не переводятся.
- Название статьи переводится обязательно, но в 5 500 знаков не входит.

### Текст фрагмента

#### 2.4 Image-Based Decision Support Systems

The access to increasing volumes of images and the capabilities of DL to process and extract information from images creates the potential to harness this rich data and DL methods to facilitate effective decision-making (Chaudhuri and Bose 2020). Despite their capabilities, DL methods, particularly CNNs, have found limited adoption in extant research of IS in general (Kraus et al. 2020), and specifically DSS. Most research performed on image-based decision support focuses on the medical application domain (Ben-Cohen et al. 2017; Comaniciu et al. 1999). However, these works use highly specific medical scans rather than images from the visible spectrum. Some examples of the scarce literature on DL-enabled image-based decision support in non-medical contexts include vision-based maintenance and monitoring applications or pattern analysis (Xie et al. 2020; Schumann et al. 2019; Chaudhuri and Bose 2020; Nazerdeylami et al. 2019; Jamshidi et al. 2018; Ren et al. 2020).

Despite the efficacy of DL methods for image processing in related decision support contexts, none of the previous work provides guidance on how to design IB-DSS. Specifically, although all these studies aim for improved data and information availability, close to no insight is provided on how to bridge the gap between the sole image processing as well as consequent information extraction, and the respective efficient, high-quality decision-making.

#### 2.5 Synthesis and Research Gap

This work aims to interweave two research domains. It combines the applied research of image processing in power line maintenance (PLM) with the need for decision support in vision-based domains in general and in PLM in particular. This allows us to tap new potential through making previously unattainable data and information from individual images available.

We address this potential by investigating the environment of automated vision-based PLC maintenance, focusing on the design of a holistic image-based decision support solution. We develop design knowledge for IB-DSS and evaluate it by instantiating a concrete artifact for PLC maintenance. We extend the reviewed existing works (cf. Table 1) by managing to detect PLCs of extreme size difference (insulators and safety pins), which we believe is a crucial prerequisite for moving towards decision support in this domain.

#### 3 Research Methodology

The research at hand develops design knowledge for IB-DSS which supports the maintenance decision-making and planning of maintenance engineers (MEs) for power lines. Since design science research (DSR) has proven itself to be not only a suitable but also an important paradigm to develop IS in general (Gregor and Hevner 2013) and DSS in particular (Arnott and Pervan 2012), we follow its steps to develop and evaluate our artifact. At its core, DSR is a problem solving paradigm that involves two primary and distinct activities to design solutions to real-world problems: (1) the development of innovative artifacts in a series of design activities based on a deep understanding of the problem, justificatory knowledge, and the capabilities of the researcher and (2) the evaluation of the novel artifact to assess its ability and utility in solving the identified problem (Hevner et al. 2004). Following this “build-and-evaluate loop” (Hevner et al. 2004), we iteratively develop an artifact to extend the knowledge base regarding IB-DSS.

Besides this loop – more precisely termed design cycle – Hevner (2007) describes the existence of two additional cycles: relevance and rigor. The three cycles are inherently related and part of any DSR project. The relevance cycle connects the environment, application domain, or case company of the research project to the design science activities by, for instance, incorporating input from expert practitioners. It does not only provide the requirements, problems, or challenges for the research, but also defines acceptance criteria (Hevner and Chatterjee 2010). The rigor cycle relates the design science activities to the existing knowledge base. It provides knowledge from scientific theories, engineering methods, experience, and expertise to the research project. The often repeatedly performed design cycle is the core of any DSR project and naturally builds on the insights from the two previous cycles. Specifically, during a design cycle the research iterates between construction and evaluation of an evolving artifact (Hevner and Chatterjee 2010) to eventually deploy the artifact in the environment as well as distill insights and output the research’s design knowledge contributions into the knowledge base.

In the general view of our research displayed in Fig. 1 we start with studying the environment in which the research is embedded. We consequently state our application case (Sect. 4.1) and review related challenges and problems (Sect. 4.2). Joining these insights with knowledge from kernel theories we conceptualize principles and requirements for the problem class of IB-DSS. We subsequently derive a concrete PLM artifact and, based on Turban et al. ’s (2010) high-level notion of a DSS, first focus on the model component (MC) of our DSS artifact in the first design cycle (Sect. 5.2). Afterwards we move to the user interface component (UIC) in the second design cycle (Sect. 5.3). To orchestrate the evaluation of our artifact, we apply and follow the overarching Framework for evaluation in design science (Venable et al. 2016) to rigorously demonstrate the utility and efficiency of the artifact and its underlying design knowledge. Figure 1 provides an overview of the performed evaluation episodes (EE) in these design cycles. As it is our goal to indicate technical feasibility as well as utility of IB-DSS enabled through DL, we start with a technical evaluation and then move to a naturalistic context within the application setting.

#### 4 Application Case and Conceptualization

Our DSS artifact, built on images from the visible spectrum, intends to support MEs of power line infrastructure in their decision-making. More precisely, our system supports the planning and scoping of individual maintenance orders for the repair and replacement of components through improved data and information quality. Because the artifact is to intervene in an organizational context, it is considered “socio-technical” (Gregor and Hevner 2013). To manage the complexity of the artifact construction in terms of size as well as social and technical components, Gregor and Hevner (2013) suggest the explicit extraction of design principles (DPs). We therefore conceptualize and suggest a number of tentative DPs for the design of artifacts of the problem class of IB-DSS by first investigating challenges in power line maintenance (PLM). These are recast into a prescriptive mode with appropriate abstraction yielding preliminary design requirements (DRs), which then serve as a basis for deriving the DPs.

## Запасной вариант фрагмента

Раздел **1 Introduction** целиком вместе с вводным абзацем раздела **2 Related Work** (до подраздела 2.1 Deep Learning), с. 708–709.
Объём: 5 887 знаков без пробелов, ≈5 643 без ссылок в скобках. Текст более общий, про энергосети, мотивацию и исследовательский вопрос. Терминов СППР в нём меньше, чем в основном варианте.
