*To use this template, first make a copy by [clicking here](https://docs.google.com/document/d/1541V32QgSwyCFWxtiMIThn-6n-2s7fVWztEWVa970uo/copy). Template by* [*Lenny Rachitsky](https://www.lennyrachitsky.com/). For advice on using the template, [read this post](https://uxdesign.cc/how-to-solve-problems-6bf14222e424?sk=7d60d49dd3f7feb571b108e2ca515824).*

# SwimCoach

**Description: What is it?**  
SwimCoach is your personal coach that has aggregated the best scientific swimming training knowledge to develop personalized training workouts for you in the pool and the gym. It learns from and draws insights from a library of scientific research papers and social media posts on swim training as its foundational knowledge base. It uses this knowledge base to then recommend workouts in the pool and gym that build off each other throughout a period (weeks, months, etc.) instead of being isolated workouts. Workouts can be customized based off your goals (sprint, distance events, amount of time to drop, etc.), training schedule (pool vs gym sessions; time available to train), and equipment availability (pool length, pool resistance equipment, no weights, dumbbells, etc.).

**Problem: What problem is this solving?** 
1. Swimmers do not have the knowledge and resources to access top world-class science backed training programs
2. Swimmers do not now how to take the scientific knowledge and put it into practical implementation to create workouts
3. Swimmers don't have training programs personalized to their goals and training schedules

**Why: How do we know this is a real problem and worth solving?**  
1. Swimming training methodologies are undergoing a evolution and there is a wealth of information where it is difficult for swimmers to stay on top of.
2.  Swimmers that are not training and competing at the top levels don't have access to world class coaches or coaches at all

**Success: How do we know if we’ve solved this problem?**  
1. We are able to generate science backed working in the pool and gym specifically for swimming
2. Workouts are customized to the swimmer's goals, training schedule, and equipment availability
3. Swimmers are able to reach their stated goals with workouts

**Audience: Who are we building for?**  
1. Primary focus is on the Masters Mac swimmer persona

**What: Roughly, what does this look like in the product?**  
These are the functional requirements to build towards.
1. **Swimmer Profile Creation Feature**
  1. User Story: As a swimmer, I want to input, store, and edit my goals, training schedule, upcoming competitions so I can get workouts that are personalized to me
    1. Profile
      1. Name
      2. Email
      3. Gender
      4. Age
    2. Goals
      1. What race length and strokes I train for. Multi-select allowed.
        1. general length (sprint, mid-distance, distance)
        2. events (all, Butterfly, Backstroke, Breaststroke, Freestyle, Individual Medley)
      2. What outcome the user wants to achieve. Multi-select allowed. 
        1. drop time
        2. build muscle
        3. loose weight
        4. maintain speed and physique
        5. work on technique
    3. Training schedule
      1. number of pool and/or gym workouts per week
      2. days of the week for pool and/or gym workout
      3. length of each pool and/or gym workout (minutes/hours)
    4. Best times per event. Users can add any number/combination of options.
      1. drop down of all strokes
        1.  Butterfly
        2. Backstroke
        3. Freestyle
        4. Individual Medley
      2. drop down of all lengths
        1. 50
        2. 100
        3. 200
        4. 400
        5. 500
        6. 800
        7. 1500
        8. 1650
      3. list all pool length options
        1. short course yards
        2. short course meters
        3. long course meters
  2. This is a UI users can interact with easily and quickly
2. **Workout Customization and Generation Feature**
  1. User Story: As a swimmer, I want to specify what kind of workouts I want to do and have workouts generated for me so that I have the best workouts available to reach my goals even without a coach.
    1. Users should be able to generate two kinds of workouts:
      1. single workout - workout for one session based on specifications from the user. Users should be able to input: 
        1. what kind of exercise - pool or gym
        2. what specific exercise focus - pool (what stroke/distance) or gym (arms, legs, core)
        3. what type of workout - speed, lactate, endurance, resistance/power, mobility
        4. length of the workout - minutes/hours
        5. equipment available - pool length (distance and unit of measurement), pool equipment (fins, paddles, parachute/resistance, etc.), gym equipment (dumbbells, barbells, kettlebells, bands, sliders, etc.) 
      2. comprehensive program - package of workouts over a time period that are interconnected/build off each other
        1. what kind of exercise - pool, gym, or both
        2. time period of program - number of weeks, months
        3. training schedule will show what was inputted in the user's profile
        4. training goal will show what was inputted in the user's profile
        5. equipment available - pool length (distance and unit of measurement), pool equipment (fins, paddles, parachute/resistance, etc.), gym equipment (dumbbells, barbells, kettlebells, bands, sliders, etc.)
    2. Show each generated workout to the user where they can:
      1. accepts the workout which saves it and adds it to the workout tracker
      2. ask for another workout to be generated
      3. edit the workout directly and/or quick chat to refine another workout to be generated
      4. for workouts generated for the comprehensive program, users should be able to perform the tasks above on individual workouts or collectively
  2. This should also be a UI uses can interact with easily and quickly
3. **Workout Generation Model**
  1. User Story: As the SwimCoach system, I want to use best swim training insights generated from the knowledge base of swimming research (OpenNotebook) and information from the swimmer's profile and workout specifications so that the SwimCoach LLM (typically OpenRouter) can generate personalized workouts that best meet the swimmer's goals and preferences. 
    1. OpenNotebook will store the knowledgebase of swimming content (sources) and analyze and summarize (notes) it to generate best swim training insights. For example: What are key trends and insights about training methods for masters swimmers training sprint? for sprint training in general? The SwimCoach system can prompt OpenNotebook for additional insights when needed.
    2. The SwimCoach system will analyze and summarize the information from the swimmer's profile and inputs from the workout customization to understand what the user wants. For example: this swimmer is a masters swimmer that wants to improve their sprint butterfly time.
    3. The SwimCoach system will read [MEMORY.md](./MEMORY.md) to get learnings and insights from past workout feedback and use as an additional source for workout generation.
    4. The SwimCoach system will then use this information to retrieve any relevant insights from the OpenNotebook swimming training knowledgebase to inform how the SwimCoach LLM (typically OpenRouter) should generate personalized workouts. For example: Masters swimmers focusing on sprint butterfly should strength train these muscles and do a combination of speed and power sets.
      1. All workouts must have:
        1. total distance (for pool workouts)
        2. total time
        3. warm up set
        4. main set
        5. cool down set
        6. structured to be easy to read
        7. each set should have a quick 1-2 sentence description of the focus areas or purpose
    5. The SwimCoach system will finally combine all the context from the steps before to generate personalized workouts for the swimmer.
4. **Workout Tracking and Feedback**
  1. User Story: As a swimmer, I want to keep track of workouts I completed so that I can track my progress and provide feedback on what went well/how it felt so the SwimCoach workout generation model can be improved.
    1. Display each workout card like you did when the workout was generated
    2. Allow quick and open response feedback on each workout individually and for the comprehensive program overall
    3. The feedback should be stored in [MEMORY.md](./MEMORY.md) and accessible for the workout generation model (SwimCoach system and OpenNotebook swim training knowledgebase) to reference to make improvements.
  2. This should also be a UI uses can interact with easily and quickly
5. **Test and Debug Mode**
  1. User Story: As the product manager for SwimCoach, I want to be able to test and have observe how the system works so that I can improve the experience. This mode should:
    1. Display and let me select from the list of all swimmer profiles
    2. Add, display, and let me select different LLMs to power workout generation. I should be able to add using openrouter/nvidia/nemotron-3-super-120b-a12b:free as an example.
    3. See what prompts were used to:
      1. retrieve insights from OpenNotebook
      2. generate workouts from the SwimCoach LLM (typically OpenRouter)
  2. This should also be a UI uses can interact with easily and quickly
6. **Design Principles**
  1. User Story: As the designer for SwimCoach, I want the design and branding of the product to follow the guidelines below so that users can better use and resonate with the app.
    1. Simplicity and intuition over complexity
    2. Feeling of Apple meets Strava - stylish yet empowering and energetic
    3. Make the product and design work for the user, not the other way around
    4. Optimize and design from a mobile first perspective

**How: What is the experiment plan?**  
1. For this stage we are focusing on ensuring the workouts created are of high quality (scientific quality) and match the swimmer's specifications (goals, training schedule, equipment).

**When: When does it ship and what are the milestones?**  
personal project, no timeline