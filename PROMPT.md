# PhysioTrace

## Introduction

An AI vision app that detects your movements during an exercise and gives real-time feedback to the user.

## Functions- note that it's not working in succession, just overall function of the app

## Functions on the client side:
1. Collect a visual feed of a patient's physical exercise 

2. Feeds it into a model that determines whether or not the rep (current movement) is correct 
- If the movement is incorrect, show a replay of the previous rep and provide feedback on the side and wait until the user starts another rep.
- If it's correct, the rep will be counted towards their daily exercise rep and be logged in the system.
- If results are inconclusive, make a short clip of the most current movement and send it to the physical therapist.

3. Get exercise (correct demo videos) datasets from the internet (youtube, websites, or free health datasets) and use the data to train our AI to classify our user's exercise gestures (movements) being correct or incorrect.

## Functions on the PT (physical therapist's time):
1. Physician can check the low confidence clips, marking it as either correct, or incorrect with feedback for the correct movement if it's incorrect.
2. Send the clip with the feedback back into the model to further train it.
3. Send the clip with the feedback to the user.