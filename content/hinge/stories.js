// Original, fictional Hinge-style conversations. No reference dialogue or faces.
export const stories = [
  {
    id: 'margin-notes', status: 'Featured two-slide', pairedReference: '7708554077088550157', title: 'The margin notes',
    description: 'A bookish compliment that seems written for one person.',
    pov: 'recipient', dark: false,
    recipient: 'Maya', sender: 'Theo', prompt: 'The quickest way to my heart is…',
    answer: 'Letting me annotate your favorite book.',
    line: 'I’d read your margin notes before I read the actual book.',
    reply: 'Okay, that was smooth.',
    recipients: ['Lena', 'Nora', 'Sloane', 'Amara', 'Cleo', 'Ivy', 'Willa'],
    times: ['Now', '3m', '8m', '12m', '18m', '24m', '31m']
  },
  {
    id: 'museum-sunday', status: 'Alternate two-slide', pairedReference: '7708554077088550157', title: 'The rainy Sunday',
    description: 'A date idea that sounds like a plan made just for her.',
    pov: 'recipient', dark: false,
    recipient: 'Iris', sender: 'Alex', prompt: 'My simple pleasures',
    answer: 'A museum when it rains outside.',
    line: 'Rainy museum date? You pick the art. I’ll pick the coffee.',
    reply: 'Coffee after is a strong pitch.',
    recipients: ['Jules', 'Farah', 'Clara', 'Bea', 'Emi', 'Rae', 'Tara'],
    times: ['Now', '2m', '6m', '11m', '16m', '23m', '29m']
  },
  {
    id: 'dog-approval', status: 'Two-slide example', pairedReference: '7708554077088550157', title: 'The dog test',
    description: 'A playful line that brings her dog into the conversation.',
    pov: 'recipient', dark: false,
    recipient: 'Remi', sender: 'Elliot', prompt: 'A fact about me that surprises people',
    answer: 'My dog has better social skills than I do.',
    line: 'I think your dog would approve of me. You might take longer.',
    reply: 'She has excellent taste, for the record.',
    recipients: ['Tessa', 'Liv', 'Simone', 'Ari', 'Gia', 'Mira', 'Elle'],
    times: ['Now', '4m', '7m', '15m', '21m', '26m', '34m']
  },
  {
    id: 'playlist', status: 'Featured two-slide', pairedReference: '7708554077088550157', title: 'The playlist',
    description: 'A music compliment in a dark-mode conversation.',
    pov: 'recipient', dark: true,
    recipient: 'Nina', sender: 'Sam', prompt: 'I go crazy for',
    answer: 'Very specific playlists for very ordinary walks.',
    line: 'Your profile is a playlist I’d save and pretend I found first.',
    reply: 'I hate how accurate that is.',
    recipients: ['Elle', 'Zoe', 'Talia', 'Wren', 'Alia', 'Kit', 'Neve'],
    times: ['Now', '1m', '5m', '9m', '14m', '20m', '27m']
  },
  {
    id: 'coffee-shop', status: 'Featured two-slide', pairedReference: '7708554077088550157', title: 'The secret coffee spot',
    description: 'A supposedly exclusive invitation, offered to everyone.',
    pov: 'recipient', dark: false,
    recipient: 'Leah', sender: 'Ben', prompt: 'We’ll get along if',
    answer: 'You know a good little coffee shop.',
    line: 'I don’t tell anyone my favorite coffee spot. I’d tell you.',
    reply: 'I better get an address, then.',
    recipients: ['Mina', 'Pia', 'Olive', 'June', 'Ada', 'Romy', 'Ana'],
    times: ['Now', '2m', '7m', '13m', '19m', '25m', '32m']
  },
  {
    id: 'crowded-room', status: 'Featured three-slide', pairedReference: '7705229880211836173', title: 'Crowded Room',
    description: 'An original quote becomes a Hinge message, then an inbox pattern.',
    format: 'quote-test-scale', frames: 3,
    quote: ['In every crowded room,', 'I’d still look for your laugh.'],
    attribution: '— An unsent letter',
    pov: 'sender', dark: false,
    recipient: 'Cora', sender: 'Miles', prompt: 'A little thing I love',
    answer: 'When somebody remembers the sound of my laugh.',
    line: 'In every crowded room, I’d still look for your laugh.',
    reply: 'That is such a lovely thing to say.',
    recipients: ['Tess', 'Nora', 'Ari', 'Leila', 'Bea', 'Mina', 'Jules'],
    times: ['Now', '2m', '6m', '11m', '17m', '24m', '30m']
  }
];

const displayOrder = ['margin-notes','coffee-shop','playlist','crowded-room','dog-approval','museum-sunday'];
stories.sort((a,b) => displayOrder.indexOf(a.id) - displayOrder.indexOf(b.id));
