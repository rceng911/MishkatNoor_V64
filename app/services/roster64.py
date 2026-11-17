import unicodedata
def arabic_order(item):
    name=unicodedata.normalize('NFKD',item.full_name).translate(str.maketrans({'ى':'ي','ـ':None}))
    return (item.halaqa_id,''.join(c for c in name if not unicodedata.combining(c)).strip(),item.full_name,item.id)
