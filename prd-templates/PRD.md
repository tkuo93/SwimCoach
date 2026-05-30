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
  1. As a swimmer, I want to input, store, and edit my goals, training schedule, upcoming competitions so I can get workouts that are personalized to me
    1. Goals
      1. what race length and strokes to train for
      2. training to drop time, stay in shape, etc.
    2. Training schedule
      1. number of workouts per week and type (pool, gym)
      2. workout schedule/time
    3. Best times per event (context for creating swimming workouts with sets and intervals that match the swimmer's speed)
    4. This is a UI users can interact with easily and quickly
2. **Workout Customization and Generation Feature**
  1. As a swimmer, I want to specify what kind of workouts I want to do and have a workout generated that fits my needs and I stay engaged, motivated, and on track.
    1. Training equipment specification - pool length, pool (fins, paddles, parachute/resistance) and gym equipment availability
    2. Type of workout - lactate, resistance/power, speed
    3. Length of workout - time
    4. Program period - length of time the workout should take into consideration to build off of each other (day, weeks, or months)
  2. These customizations are all optional and if they conflict with sections from the swimmer profile section (eg: goal of sprint event training but swimmer specified endurance/distance in type of workout), the workout customization preference should be taken in.
  3. Show each generated workout to the user where they can:
    1. ask for another workout
    2. chat to provide feedback/edit the workout
    3. save the workout to track and use for future workouts
  4. This should also be a UI uses can interact with easily and quickly
3. **Workout Generation Model**
  1. As the SwimCoach system, I want to generate workouts based on the knowledge base of swimming training research and the swimmer's profile and workout customization information so that I generate scientifically proven workouts personalized to the swimmer.
  2. NotebookLM will be used to store the swim training knowledgebase
  3. NotebookLM will also analyze and summarize the swim training knowledgebase to understand best methods and findings for swim training based on different training goals and categories it surfaces from its assessment.
  4. The SwimCoach system will connect to NotebookLM for context on worldclass swimming training research to be used to generate workouts. This context will be combined with the swimmer's profile and workout customization specifications to then generate personalized workouts for the swimmer.

**How: What is the experiment plan?**  
1. For this stage we are focusing on ensuring the workouts created are of high quality (scientific quality) and match the swimmer's specifications (goals, training schedule, equipment).

**When: When does it ship and what are the milestones?**  
personal project, no timeline