const option = (id, label, visual = null) => ({ id, label, ...(visual ? { visual } : {}) });
const single = (id, prompt, options, correctAnswer, extra = {}) => ({ id, kind: 'single_choice', prompt, options, correctAnswer, ...extra });
const ordering = (id, prompt, steps) => ({ id, kind: 'ordering', prompt, options: steps.map((label, index) => option(`step_${index + 1}`, label)), correctOrder: steps.map((_label, index) => `step_${index + 1}`), interactionType: 'ordering' });
const memory = (id, studyItems, distractors) => ({
  id, kind: 'multi_recall', prompt: 'Which items did you see?', studyItems,
  options: [...studyItems, ...distractors].map((label) => option(label.toLowerCase().replace(/\s+/g, '_'), label)),
  correctAnswers: studyItems.map((label) => label.toLowerCase().replace(/\s+/g, '_')), interactionType: 'multi_select',
});

const BANK = {
  word_category: {
    easy: [
      single('wc_e1', 'Which of these is a fruit?', [option('apple', 'Apple'), option('chair', 'Chair'), option('bus', 'Bus')], 'apple'),
      single('wc_e2', 'Which of these is a drink?', [option('water', 'Water'), option('shoe', 'Shoe'), option('table', 'Table')], 'water'),
      single('wc_e3', 'Which of these is an animal?', [option('cat', 'Cat'), option('cup', 'Cup'), option('hat', 'Hat')], 'cat'),
      single('wc_e4', 'Which of these is clothing?', [option('shirt', 'Shirt'), option('spoon', 'Spoon'), option('book', 'Book')], 'shirt'),
      single('wc_e5', 'Which of these is a flower?', [option('rose', 'Rose'), option('car', 'Car'), option('plate', 'Plate')], 'rose'),
    ],
    medium: [
      single('wc_m1', 'Which item is used for measuring?', [option('ruler', 'Ruler'), option('pillow', 'Pillow'), option('orange', 'Orange'), option('sock', 'Sock')], 'ruler'),
      single('wc_m2', 'Which item belongs in a kitchen?', [option('saucepan', 'Saucepan'), option('scarf', 'Scarf'), option('stamp', 'Stamp'), option('pencil', 'Pencil')], 'saucepan'),
      single('wc_m3', 'Which is a type of transport?', [option('bicycle', 'Bicycle'), option('blanket', 'Blanket'), option('banana', 'Banana'), option('bottle', 'Bottle')], 'bicycle'),
      single('wc_m4', 'Which item is used for writing?', [option('marker', 'Marker'), option('kettle', 'Kettle'), option('towel', 'Towel'), option('fork', 'Fork')], 'marker'),
      single('wc_m5', 'Which is a musical instrument?', [option('piano', 'Piano'), option('mirror', 'Mirror'), option('basket', 'Basket'), option('clock', 'Clock')], 'piano'),
    ],
  },
  odd_one_out: {
    easy: [
      single('oo_e1', 'Which item does not belong?', [option('apple', 'Apple'), option('banana', 'Banana'), option('carrot', 'Carrot'), option('orange', 'Orange')], 'carrot'),
      single('oo_e2', 'Which item does not belong?', [option('cat', 'Cat'), option('dog', 'Dog'), option('chair', 'Chair')], 'chair'),
      single('oo_e3', 'Which item does not belong?', [option('cup', 'Cup'), option('plate', 'Plate'), option('bus', 'Bus')], 'bus'),
      single('oo_e4', 'Which item does not belong?', [option('red', 'Red'), option('blue', 'Blue'), option('bread', 'Bread')], 'bread'),
      single('oo_e5', 'Which item does not belong?', [option('shirt', 'Shirt'), option('coat', 'Coat'), option('spoon', 'Spoon')], 'spoon'),
    ],
    medium: [
      single('oo_m1', 'Which item does not belong?', [option('violin', 'Violin'), option('guitar', 'Guitar'), option('piano', 'Piano'), option('radio', 'Radio')], 'radio'),
      single('oo_m2', 'Which item does not belong?', [option('spring', 'Spring'), option('summer', 'Summer'), option('monday', 'Monday'), option('winter', 'Winter')], 'monday'),
      single('oo_m3', 'Which item does not belong?', [option('circle', 'Circle'), option('square', 'Square'), option('triangle', 'Triangle'), option('yellow', 'Yellow')], 'yellow'),
      single('oo_m4', 'Which item does not belong?', [option('walk', 'Walk'), option('run', 'Run'), option('sleep', 'Sleep'), option('bicycle', 'Bicycle')], 'bicycle'),
      single('oo_m5', 'Which item does not belong?', [option('teaspoon', 'Teaspoon'), option('tablespoon', 'Tablespoon'), option('cup', 'Cup'), option('kilometre', 'Kilometre')], 'kilometre'),
    ],
  },
  word_completion: {
    easy: [
      single('wd_e1', 'Complete the word: C _ T', [option('cat', 'Cat'), option('cot', 'Cot'), option('cut', 'Cut')], 'cat'),
      single('wd_e2', 'Complete the word: B _ OK', [option('book', 'Book'), option('back', 'Back'), option('bike', 'Bike')], 'book'),
      single('wd_e3', 'Complete the word: F _ SH', [option('fish', 'Fish'), option('fresh', 'Fresh'), option('finish', 'Finish')], 'fish'),
      single('wd_e4', 'Complete the word: M _ LK', [option('milk', 'Milk'), option('mark', 'Mark'), option('melt', 'Melt')], 'milk'),
      single('wd_e5', 'Complete the word: H _ T', [option('hat', 'Hat'), option('hit', 'Hit'), option('hot', 'Hot')], 'hat'),
    ],
    medium: [
      single('wd_m1', 'Complete the word: G _ RDEN', [option('garden', 'Garden'), option('golden', 'Golden'), option('guardian', 'Guardian'), option('gordon', 'Gordon')], 'garden'),
      single('wd_m2', 'Complete the word: W _ NDOW', [option('window', 'Window'), option('wonder', 'Wonder'), option('winding', 'Winding'), option('winner', 'Winner')], 'window'),
      single('wd_m3', 'Complete the word: M _ RNING', [option('morning', 'Morning'), option('meaning', 'Meaning'), option('moving', 'Moving'), option('meeting', 'Meeting')], 'morning'),
      single('wd_m4', 'Complete the word: K _ TCHEN', [option('kitchen', 'Kitchen'), option('kitten', 'Kitten'), option('catching', 'Catching'), option('knitting', 'Knitting')], 'kitchen'),
      single('wd_m5', 'Complete the word: F _ OWER', [option('flower', 'Flower'), option('fewer', 'Fewer'), option('flour', 'Flour'), option('floor', 'Floor')], 'flower'),
    ],
  },
  pattern_sequence: {
    easy: [
      single('ps_e1', 'What comes next?', [option('circle', 'Circle', 'circle'), option('triangle', 'Triangle', 'triangle'), option('star', 'Star', 'star')], 'circle', { sequence: ['circle', 'square', 'circle', 'square'], interactionType: 'visual_choice' }),
      single('ps_e2', 'What comes next?', [option('square', 'Square', 'square'), option('circle', 'Circle', 'circle'), option('star', 'Star', 'star')], 'square', { sequence: ['square', 'circle', 'square', 'circle'], interactionType: 'visual_choice' }),
      single('ps_e3', 'What comes next?', [option('star', 'Star', 'star'), option('triangle', 'Triangle', 'triangle'), option('circle', 'Circle', 'circle')], 'star', { sequence: ['star', 'triangle', 'star', 'triangle'], interactionType: 'visual_choice' }),
      single('ps_e4', 'What comes next?', [option('blue', 'Blue'), option('yellow', 'Yellow'), option('green', 'Green')], 'blue', { sequence: ['blue', 'yellow', 'blue', 'yellow'], interactionType: 'visual_choice' }),
      single('ps_e5', 'What comes next?', [option('one', '1'), option('two', '2'), option('three', '3')], 'one', { sequence: ['1', '2', '1', '2'], interactionType: 'visual_choice' }),
    ],
    medium: [
      single('ps_m1', 'What comes next?', [option('circle', 'Circle', 'circle'), option('square', 'Square', 'square'), option('triangle', 'Triangle', 'triangle'), option('star', 'Star', 'star')], 'circle', { sequence: ['circle', 'circle', 'square', 'circle', 'circle', 'square'], interactionType: 'visual_choice' }),
      single('ps_m2', 'What comes next?', [option('triangle', 'Triangle', 'triangle'), option('circle', 'Circle', 'circle'), option('square', 'Square', 'square'), option('star', 'Star', 'star')], 'triangle', { sequence: ['circle', 'square', 'triangle', 'circle', 'square'], interactionType: 'visual_choice' }),
      single('ps_m3', 'What comes next?', [option('square', 'Square', 'square'), option('circle', 'Circle', 'circle'), option('star', 'Star', 'star'), option('triangle', 'Triangle', 'triangle')], 'square', { sequence: ['circle', 'square', 'square', 'circle', 'circle'], interactionType: 'visual_choice' }),
      single('ps_m4', 'What comes next?', [option('two', '2'), option('one', '1'), option('three', '3'), option('four', '4')], 'two', { sequence: ['1', '1', '2', '1', '1'], interactionType: 'visual_choice' }),
      single('ps_m5', 'What comes next?', [option('green', 'Green'), option('blue', 'Blue'), option('yellow', 'Yellow'), option('red', 'Red')], 'green', { sequence: ['red', 'blue', 'green', 'red', 'blue'], interactionType: 'visual_choice' }),
    ],
  },
  short_memory_recall: {
    easy: [
      memory('mr_e1', ['Apple', 'Book', 'Flower'], ['Chair', 'Car']), memory('mr_e2', ['Cup', 'Key', 'Hat'], ['Spoon', 'Ball']),
      memory('mr_e3', ['Bus', 'Tree', 'Clock'], ['Boat', 'Plate']), memory('mr_e4', ['Bread', 'Radio', 'Shoe'], ['Cake', 'Lamp']),
      memory('mr_e5', ['Dog', 'Pen', 'Towel'], ['Cat', 'Fork']),
    ],
    medium: [
      memory('mr_m1', ['Orange', 'Basket', 'Garden', 'Mirror'], ['Apple', 'Bottle']), memory('mr_m2', ['Kettle', 'Scarf', 'Pencil', 'Window'], ['Saucepan', 'Marker']),
      memory('mr_m3', ['Bicycle', 'Pillow', 'Rose', 'Plate'], ['Bus', 'Blanket']), memory('mr_m4', ['Calendar', 'Banana', 'Jacket', 'Spoon'], ['Clock', 'Orange']),
      memory('mr_m5', ['Teapot', 'Newspaper', 'Glasses', 'Cushion'], ['Cup', 'Book']),
    ],
  },
  orientation_activity: {
    easy: [
      single('or_e1', 'Which part of the day comes after morning?', [option('afternoon', 'Afternoon'), option('night', 'Night'), option('morning', 'Morning')], 'afternoon'),
      single('or_e2', 'Which day comes after Monday?', [option('tuesday', 'Tuesday'), option('thursday', 'Thursday'), option('sunday', 'Sunday')], 'tuesday'),
      single('or_e3', 'Which meal is usually eaten in the morning?', [option('breakfast', 'Breakfast'), option('dinner', 'Dinner'), option('supper', 'Supper')], 'breakfast'),
      single('or_e4', 'Which season usually comes after spring?', [option('summer', 'Summer'), option('winter', 'Winter'), option('autumn', 'Autumn')], 'summer'),
      single('or_e5', 'Which day comes before Friday?', [option('thursday', 'Thursday'), option('monday', 'Monday'), option('saturday', 'Saturday')], 'thursday'),
    ],
    medium: [
      single('or_m1', 'If today is Wednesday, what day is tomorrow?', [option('thursday', 'Thursday'), option('tuesday', 'Tuesday'), option('friday', 'Friday'), option('monday', 'Monday')], 'thursday'),
      single('or_m2', 'If today is Sunday, what day was yesterday?', [option('saturday', 'Saturday'), option('monday', 'Monday'), option('friday', 'Friday'), option('tuesday', 'Tuesday')], 'saturday'),
      single('or_m3', 'Which month comes after June?', [option('july', 'July'), option('may', 'May'), option('august', 'August'), option('april', 'April')], 'july'),
      single('or_m4', 'Which part of the day comes before evening?', [option('afternoon', 'Afternoon'), option('night', 'Night'), option('morning', 'Morning'), option('midnight', 'Midnight')], 'afternoon'),
      single('or_m5', 'If an appointment is two days after Monday, which day is it?', [option('wednesday', 'Wednesday'), option('tuesday', 'Tuesday'), option('thursday', 'Thursday'), option('sunday', 'Sunday')], 'wednesday'),
    ],
  },
  simple_math: {
    easy: [
      single('ma_e1', 'What is 5 plus 3?', [option('8', '8'), option('7', '7'), option('9', '9')], '8'),
      single('ma_e2', 'What is 10 minus 4?', [option('6', '6'), option('5', '5'), option('7', '7')], '6'),
      single('ma_e3', 'You have 6 apples and receive 2 more. How many apples do you have?', [option('8', '8'), option('6', '6'), option('4', '4')], '8'),
      single('ma_e4', 'How many are 2 groups of 3?', [option('6', '6'), option('5', '5'), option('8', '8')], '6'),
      single('ma_e5', 'What is 9 minus 2?', [option('7', '7'), option('6', '6'), option('8', '8')], '7'),
    ],
    medium: [
      single('ma_m1', 'What is 12 minus 5?', [option('7', '7'), option('6', '6'), option('8', '8'), option('9', '9')], '7'),
      single('ma_m2', 'What is 8 plus 7?', [option('15', '15'), option('14', '14'), option('16', '16'), option('13', '13')], '15'),
      single('ma_m3', 'A bus has 9 passengers and 4 more get on. How many passengers are there?', [option('13', '13'), option('12', '12'), option('14', '14'), option('5', '5')], '13'),
      single('ma_m4', 'You have 15 coins and use 6. How many remain?', [option('9', '9'), option('8', '8'), option('10', '10'), option('11', '11')], '9'),
      single('ma_m5', 'Three cups are placed on each of 4 trays. How many cups are there?', [option('12', '12'), option('10', '10'), option('7', '7'), option('14', '14')], '12'),
    ],
  },
  sequence_ordering: {
    easy: [
      ordering('so_e1', 'Put these tea-making steps in order.', ['Boil water', 'Put tea in the cup', 'Pour in the hot water']),
      ordering('so_e2', 'Put these hand-washing steps in order.', ['Turn on the water', 'Wash with soap', 'Dry your hands']),
      ordering('so_e3', 'Put these morning steps in order.', ['Wake up', 'Get dressed', 'Eat breakfast']),
      ordering('so_e4', 'Put these letter-posting steps in order.', ['Write the letter', 'Put it in an envelope', 'Post the envelope']),
      ordering('so_e5', 'Put these plant-watering steps in order.', ['Fill the watering can', 'Water the soil', 'Put the can away']),
    ],
    medium: [
      ordering('so_m1', 'Put these meal-preparation steps in order.', ['Choose a simple recipe', 'Gather ingredients', 'Prepare the meal', 'Serve the meal']),
      ordering('so_m2', 'Put these laundry steps in order.', ['Collect the clothes', 'Wash the clothes', 'Dry the clothes', 'Fold the clothes']),
      ordering('so_m3', 'Put these shopping steps in order.', ['Write a list', 'Go to the shop', 'Choose the items', 'Pay for the items']),
      ordering('so_m4', 'Put these appointment steps in order.', ['Check the appointment time', 'Travel to the clinic', 'Check in at reception', 'Meet the clinician']),
      ordering('so_m5', 'Put these table-setting steps in order.', ['Place the plates', 'Place the cutlery', 'Add the cups', 'Invite everyone to sit']),
    ],
  },
};

const META = {
  word_category: ['Word Category Match', 'Find the item that belongs to the named group.', 'language'],
  odd_one_out: ['Odd One Out', 'Notice which everyday item does not belong.', 'search'],
  word_completion: ['Word Completion', 'Complete familiar words from a clear choice.', 'letters'],
  pattern_sequence: ['Pattern Sequence', 'Find what comes next in a simple pattern.', 'shapes'],
  short_memory_recall: ['Short Memory Recall', 'Take a moment to remember a few familiar items.', 'cards'],
  orientation_activity: ['Orientation Activity', 'Enjoy simple questions about everyday time and order.', 'compass'],
  simple_math: ['Simple Math & Counting', 'Work through friendly everyday number questions.', 'calculator'],
  sequence_ordering: ['Sequence Ordering', 'Arrange familiar everyday steps in order.', 'ordered-list'],
};

function getTaskItems(activityType, difficulty) { return BANK[activityType]?.[difficulty] || []; }
module.exports = { BANK, META, getTaskItems };
