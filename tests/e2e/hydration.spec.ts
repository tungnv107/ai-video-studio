import {test,expect} from '@playwright/test';

test('login hydrates when a browser extension adds attributes to body',async({page})=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.addInitScript(()=>{
    const addAttribute=()=>{
      if(!document.body)return false;
      document.body.setAttribute('cz-shortcut-listen','true');
      return true;
    };
    if(!addAttribute()){
      const observer=new MutationObserver(()=>{if(addAttribute())observer.disconnect();});
      observer.observe(document.documentElement||document,{childList:true,subtree:true});
    }
  });
  await page.goto('/login');
  await expect(page.locator('body')).toHaveAttribute('cz-shortcut-listen','true');
  await expect(page.getByLabel('Email',{exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'Tạo tài khoản',exact:true}).click();
  await expect(page.getByLabel('Họ và tên')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Email',{exact:true})).toBeEnabled();
  await page.screenshot({path:'artifacts/ui-login-hydration.png',fullPage:true});
  expect(errors).toEqual([]);
});

test('body compatibility still reports hydration mismatches inside the app',async({page})=>{
  const warnings:string[]=[];
  page.on('console',message=>{if(message.type()==='error')warnings.push(message.text());});
  await page.addInitScript(()=>{
    const observer=new MutationObserver(()=>{
      const form=document.querySelector('form');
      if(form){form.setAttribute('data-hydration-regression','test-only');observer.disconnect();}
    });
    observer.observe(document,{childList:true,subtree:true});
  });
  await page.goto('/login');
  await expect(page.getByLabel('Email',{exact:true})).toBeEnabled();
  await expect.poll(()=>warnings.some(w=>/hydrated|hydration/i.test(w)&&w.includes('data-hydration-regression'))).toBe(true);
});
