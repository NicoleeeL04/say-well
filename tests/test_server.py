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

if __name__=='__main__':unittest.main()
