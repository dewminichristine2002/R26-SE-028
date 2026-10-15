# YOLO Pill Detector Model Comparison

Each model was trained on the same pill detector dataset and training settings.
Training fraction: 0.050
The deployment model is selected by mAP50-95 per MB, which balances validation accuracy with model size.

Selected deployment model: **yolo11n.pt**

Selection rule: highest deployment score, treating scores within 0.010 as comparable and selecting the smaller model.

| Model | Precision | Recall | mAP50 | mAP50-95 | Weights MB | Deployment Score | Epochs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| yolo11m.pt | 0.39163 | 0.27280 | 0.22682 | 0.17177 | 38.59819 | 0.00445 | 1 |
| yolo11n.pt | 0.28307 | 0.10120 | 0.09191 | 0.06770 | 5.17886 | 0.01307 | 1 |
| yolo11s.pt | 0.26522 | 0.51830 | 0.19884 | 0.15670 | 18.24917 | 0.00859 | 1 |

Evidence files:

- yolo11m.pt: `D:\Document\SLIIT\Research\Project\ElderMeds\backend\ml\runs\detect\model_compare_quick\pill_detector_compare_yolo11m\results.csv`
- yolo11n.pt: `D:\Document\SLIIT\Research\Project\ElderMeds\backend\ml\runs\detect\model_compare_quick\pill_detector_compare_yolo11n\results.csv`
- yolo11s.pt: `D:\Document\SLIIT\Research\Project\ElderMeds\backend\ml\runs\detect\model_compare_quick\pill_detector_compare_yolo11s\results.csv`
