# Colon cancer CNN

A 4-layer convolutional network that reads a colorectal tissue tile as benign or malignant.

The tiles are from the public Kather colorectal histology set (Zenodo, CC BY 4.0). The project trained the custom network for 50 epochs and compared it with MobileNet, VGG16, ResNet50, and EfficientNetB1. Validation accuracy was 66.83%, then 71.71% after augmentation. EfficientNetB1 reached about 87% on the test set.

Open `index.html`. This is not a diagnosis.
