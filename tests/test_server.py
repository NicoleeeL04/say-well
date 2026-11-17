import importlib.util
import unittest
from unittest.mock import patch
from pathlib import Path
spec = importlib.util.spec_from_file_location('server', Path(__file__).resolve().parents[1] / 'server.py')
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)

class InterpretationValidation(unittest.TestCase):
    def result(self):
        return {'reply':'请确认左膝的位置。','translation':'My left knee hurts.','statement':'My left knee hurts.','ready':True,'dental':{'involved':False,'locations':[]},'details':dict.fromkeys(server.FIELDS,''),'regions':[{'region':'knee','side':'left'}]}
    def test_unknown_details_stay_empty_and_patient_side_retained(self):
        result=server.validate_result(self.result())
        self.assertEqual(result['regions'],[{'region':'knee','side':'left','surface':'unspecified'}])
        self.assertEqual(result['details']['severity'],'')
    def test_invalid_locations_and_sides_rejected(self):
        for region,side in [('heart','left'),('knee','guessed')]:
            data=self.result();data['regions']=[{'region':region,'side':side}]
            with self.assertRaises(ValueError):server.validate_result(data)
    def test_non_text_fields_rejected(self):
        data=self.result();data['details']['symptom']={'unexpected':'value'}
        with self.assertRaises(ValueError):server.validate_result(data)
    def test_invalid_dental_tooth_is_rejected(self):
        data=self.result()
        data['dental']={'involved':True,'locations':[{'jaw':'upper','side':'left','area':'back','tooth':99,'includesGum':False}]}
        with self.assertRaises(ValueError):server.validate_result(data)
    def test_denied_dental_symptom_cannot_carry_locations(self):
        data=self.result()
        data['dental']={'involved':False,'locations':[{'jaw':'upper','side':'left','area':'back','tooth':0,'includesGum':False}]}
        with self.assertRaises(ValueError):server.validate_result(data)
    def test_duplicates_removed(self):
        data=self.result();data['regions']*=2
        self.assertEqual(len(server.validate_result(data)['regions']),1)

class TranslationIsolation(unittest.TestCase):
    def result(self):
        return {'reply':'When did it start?', 'translation':'unused', 'statement':'My hand is numb.',
                'ready':False, 'dental':{'involved':False,'locations':[]},'details':dict.fromkeys(server.FIELDS,''), 'regions':[]}

    def test_english_input_is_retained_even_if_model_switches_language(self):
        original='Maybe my hand is numb, but it is not painful.'
        def fake(key,messages,schema,name):
            if name=='original_translation':
                return {'source_language':'en','translation':'Una traducción incorrecta.'}
            return self.result()
        with patch.object(server,'model_json',side_effect=fake):
            result=server.interpret('test',[{'role':'user','content':original}])
        self.assertEqual(result['translation'],original)

    def test_literal_translator_never_receives_assistant_questions_or_earlier_reports(self):
        calls=[]
        def fake(key,messages,schema,name):
            if name=='original_translation':
                calls.append(messages)
                return {'source_language':'zh','translation':'Sorry, I meant left, not right.'}
            return self.result()
        messages=[{'role':'user','content':'右手疼。'}, {'role':'assistant','content':'How long?'},
                  {'role':'user','content':'对不起，是左边，不是右边。'}]
        with patch.object(server,'model_json',side_effect=fake):
            result=server.interpret('test',messages)
        self.assertEqual(calls[0][1:],messages[-1:])
        self.assertEqual(result['translation'],'Sorry, I meant left, not right.')


class DoctorReplyTests(unittest.TestCase):
    def reply(self, **over):
        base={'translation':'每天两次布洛芬。','medications':[{'name':'Ibuprofen','instructions':'400 毫克，每天两次'}],
              'follow_up':'两周后','return_if':'膝盖肿了','other':'','labels':{'title':'医生说了什么','medications':'用药','follow_up':'复诊','return_if':'尽早回来','other':'其他'}}
        base.update(over); return base

    def test_doctor_reply_targets_requested_language_and_keeps_text_as_data(self):
        seen={}
        def fake(key,messages,schema,name):
            seen.update(name=name,messages=messages); return self.reply()
        with patch.object(server,'model_json',side_effect=fake):
            result=server.doctor_reply('k','Take ibuprofen 400 mg twice a day.','Chinese')
        self.assertEqual(seen['name'],'doctor_reply')
        self.assertIn('Chinese',seen['messages'][0]['content'])
        self.assertEqual(seen['messages'][1],{'role':'user','content':'Take ibuprofen 400 mg twice a day.'})
        self.assertEqual(result['medications'][0]['name'],'Ibuprofen')

    def test_doctor_reply_rejects_empty_or_malformed_output(self):
        for bad in [self.reply(translation=''), self.reply(medications='x'), self.reply(labels={'title':'x'}), self.reply(medications=[{'name':1,'instructions':''}])]:
            with self.assertRaises(ValueError): server.validate_doctor(bad)

    def test_blank_medication_names_are_dropped(self):
        self.assertEqual(server.validate_doctor(self.reply(medications=[{'name':' ','instructions':'x'}]))['medications'],[])

if __name__=='__main__':unittest.main()


class ModelEndpointTests(unittest.TestCase):
    def test_default_is_openai_with_key_and_no_store(self):
        with patch.dict(server.os.environ, {'OPENAI_API_KEY': 'k'}, clear=True):
            request = server.model_request('k', [], {}, 'x')
            body = server.json.loads(request.data)
            self.assertEqual(request.full_url, 'https://api.openai.com/v1/chat/completions')
            self.assertEqual(request.get_header('Authorization'), 'Bearer k')
            self.assertIs(body['store'], False)
            self.assertTrue(server.ai_configured())

    def test_local_base_url_needs_no_key(self):
        env = {'OPENAI_BASE_URL': 'http://localhost:11434/v1/', 'OPENAI_MODEL': 'qwen2.5:7b'}
        with patch.dict(server.os.environ, env, clear=True):
            request = server.model_request('', [], {}, 'x')
            body = server.json.loads(request.data)
            self.assertEqual(request.full_url, 'http://localhost:11434/v1/chat/completions')
            self.assertIsNone(request.get_header('Authorization'))
            self.assertNotIn('store', body)
            self.assertEqual(body['model'], 'qwen2.5:7b')
            self.assertTrue(server.ai_configured())

    def test_nothing_configured_means_manual_mode(self):
        with patch.dict(server.os.environ, {}, clear=True):
            self.assertFalse(server.ai_configured())
