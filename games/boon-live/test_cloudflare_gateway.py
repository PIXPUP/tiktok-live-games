import unittest
from cloudflare_gateway import EventJournal

def message(actions, event=None):
    state = {'actions': actions, 'score': actions, 'players': {}, 'recent': []}
    return {'state': state, **({'event': event} if event else {})}

class JournalTests(unittest.TestCase):
    def test_initial_snapshot_and_cursor_do_not_replay_old_gifts(self):
        journal = EventJournal()
        self.assertFalse(journal.read()['ready'])
        journal.accept(message(10))
        first = journal.read()
        self.assertTrue(first['reset'])
        self.assertEqual(first['events'], [])
        event = {'action': 'incense', 'name': 'ผู้ชมทดสอบ', 'count': 1, 'points': 1}
        journal.accept(message(11, event))
        new = journal.read(first['cursor'], first['epoch'])
        self.assertEqual(new['events'][0]['event'], event)
        self.assertEqual(journal.read(new['cursor'], new['epoch'])['events'], [])

    def test_batch_cursor_keeps_every_event_in_order(self):
        journal = EventJournal()
        journal.accept(message(0))
        first = journal.read()
        for index in range(150):
            journal.accept(message(index+1, {'action': 'tree', 'name': str(index), 'count': 1, 'points': 10}))
        received = []
        cursor = first['cursor']
        for _ in range(3):
            batch = journal.read(cursor, first['epoch'])
            received.extend(item['seq'] for item in batch['events'])
            cursor = batch['cursor']
        self.assertEqual(received, list(range(1, 151)))

    def test_restart_and_buffer_expiry_reset_without_old_audio(self):
        journal = EventJournal(capacity=2)
        journal.accept(message(0))
        first = journal.read()
        for index in range(3):
            journal.accept(message(index+1, {'action': 'temple'}))
        expired = journal.read(0, first['epoch'])
        self.assertTrue(expired['reset'])
        self.assertEqual(expired['events'], [])
        journal.accept(message(0))
        reset = journal.read(expired['cursor'], expired['epoch'])
        self.assertTrue(reset['reset'])
        self.assertNotEqual(reset['epoch'], first['epoch'])

if __name__ == '__main__':
    unittest.main()
